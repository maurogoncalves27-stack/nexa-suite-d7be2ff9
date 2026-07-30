import { supabase } from "@/integrations/supabase/client";

/**
 * Público-alvo dos check-lists.
 *
 * Regra única usada por todos os painéis: só é cobrado (pendente / expirado /
 * denominador de conformidade) o colaborador que:
 *  1. tem cadastro em `employees` com status = 'active';
 *  2. pertence a um grupo de acesso do template;
 *  3. está lotado ou alocado em uma das lojas do template (quando o template
 *     tem lojas vinculadas);
 *  4. e, quando o template tem `require_scheduled = true`, está escalado
 *     naquele dia (work_schedules, sem folga).
 */

export interface AudienceTemplate {
  id: string;
  weekdays?: number[] | null;
  require_scheduled?: boolean | null;
  template_access_groups: { group_id: string }[];
}

export interface AudiencePerson {
  user_id: string;
  employee_id: string;
  full_name: string;
  store_id: string | null;
  allocated_store_id: string | null;
}

export interface AudienceData {
  /** colaboradores ativos elegíveis, por user_id */
  people: Map<string, AudiencePerson>;
  /** grupos de acesso por user_id */
  groupsByUser: Map<string, Set<string>>;
  /** lojas vinculadas por template */
  storesByTemplate: Map<string, Set<string>>;
  /** lojas em que o colaborador está escalado na data (sem folga) */
  scheduledStoresByUser: Map<string, Set<string>>;
  /** colaboradores atribuídos individualmente (user_id) por template */
  assignedUsersByTemplate: Map<string, Set<string>>;
  /** vínculos de grupo inválidos (não colaborador / desligado) */
  invalidMemberships: {
    user_id: string;
    group_id: string;
    full_name: string;
    reason: "nao_colaborador" | "desligado";
  }[];
}


export async function loadChecklistAudience(date: string): Promise<AudienceData> {
  const [{ data: emps }, { data: ug }, { data: cts }, { data: sched }, { data: assigns }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, user_id, full_name, status, store_id, allocated_store_id")
        .not("user_id", "is", null),
      supabase.from("user_access_groups").select("user_id, group_id"),
      supabase.from("checklist_template_stores").select("template_id, store_id"),
      supabase
        .from("work_schedules")
        .select("employee_id, store_id, is_day_off")
        .eq("schedule_date", date),
      supabase.from("checklist_template_assignments").select("template_id, employee_id"),
    ]);


  const people = new Map<string, AudiencePerson>();
  const inactiveByUser = new Map<string, string>();
  const employeeIdToUser = new Map<string, string>();
  for (const e of (emps ?? []) as any[]) {
    if (!e.user_id) continue;
    employeeIdToUser.set(e.id, e.user_id);
    if (e.status === "active") {
      people.set(e.user_id, {
        user_id: e.user_id,
        employee_id: e.id,
        full_name: e.full_name ?? "(sem nome)",
        store_id: e.store_id ?? null,
        allocated_store_id: e.allocated_store_id ?? null,
      });
    } else {
      inactiveByUser.set(e.user_id, e.full_name ?? "(sem nome)");
    }
  }

  const groupsByUser = new Map<string, Set<string>>();
  const invalidMemberships: AudienceData["invalidMemberships"] = [];
  for (const row of (ug ?? []) as any[]) {
    if (!groupsByUser.has(row.user_id)) groupsByUser.set(row.user_id, new Set());
    groupsByUser.get(row.user_id)!.add(row.group_id);
    if (!people.has(row.user_id)) {
      invalidMemberships.push({
        user_id: row.user_id,
        group_id: row.group_id,
        full_name: inactiveByUser.get(row.user_id) ?? "(não é colaborador)",
        reason: inactiveByUser.has(row.user_id) ? "desligado" : "nao_colaborador",
      });
    }
  }

  const storesByTemplate = new Map<string, Set<string>>();
  for (const row of (cts ?? []) as any[]) {
    if (!storesByTemplate.has(row.template_id)) storesByTemplate.set(row.template_id, new Set());
    storesByTemplate.get(row.template_id)!.add(row.store_id);
  }

  const scheduledStoresByUser = new Map<string, Set<string>>();
  for (const row of (sched ?? []) as any[]) {
    if (row.is_day_off) continue;
    const uid = employeeIdToUser.get(row.employee_id);
    if (!uid) continue;
    if (!scheduledStoresByUser.has(uid)) scheduledStoresByUser.set(uid, new Set());
    scheduledStoresByUser.get(uid)!.add(row.store_id);
  }

  const assignedUsersByTemplate = new Map<string, Set<string>>();
  for (const row of (assigns ?? []) as any[]) {
    const uid = employeeIdToUser.get(row.employee_id);
    if (!uid) continue;
    if (!assignedUsersByTemplate.has(row.template_id)) {
      assignedUsersByTemplate.set(row.template_id, new Set());
    }
    assignedUsersByTemplate.get(row.template_id)!.add(uid);
  }

  return {
    people,
    groupsByUser,
    storesByTemplate,
    scheduledStoresByUser,
    assignedUsersByTemplate,
    invalidMemberships,
  };

}

/** O template roda nesse dia da semana? */
export function templateRunsOnDay(tpl: AudienceTemplate, dayOfWeek: number) {
  return !tpl.weekdays || tpl.weekdays.length === 0 || tpl.weekdays.includes(dayOfWeek);
}

/** Um colaborador específico é cobrado nesse template? */
export function isExpectedForTemplate(
  audience: AudienceData,
  tpl: AudienceTemplate,
  userId: string,
): boolean {
  const person = audience.people.get(userId);
  if (!person) return false; // não é colaborador ativo

  // Atribuição individual: entra mesmo sem grupo e ignora o filtro de loja
  const assignedIndividually = audience.assignedUsersByTemplate.get(tpl.id)?.has(userId) ?? false;

  const tplStores = audience.storesByTemplate.get(tpl.id);

  if (!assignedIndividually) {
    const userGroups = audience.groupsByUser.get(userId);
    if (!userGroups || !tpl.template_access_groups.some((g) => userGroups.has(g.group_id))) {
      return false;
    }

    if (tplStores && tplStores.size > 0) {
      const belongs =
        (person.store_id && tplStores.has(person.store_id)) ||
        (person.allocated_store_id && tplStores.has(person.allocated_store_id));
      if (!belongs) return false;
    }
  }

  if (tpl.require_scheduled) {
    const scheduled = audience.scheduledStoresByUser.get(userId);
    if (!scheduled || scheduled.size === 0) return false;
    if (!assignedIndividually && tplStores && tplStores.size > 0) {
      let ok = false;
      scheduled.forEach((s) => { if (tplStores.has(s)) ok = true; });
      if (!ok) return false;
    }
  }


  return true;
}

/** Lista de colaboradores cobrados nesse template (dentro de um conjunto opcional). */
export function expectedUsersForTemplate(
  audience: AudienceData,
  tpl: AudienceTemplate,
  candidateUserIds?: Iterable<string>,
): AudiencePerson[] {
  const ids = candidateUserIds ? Array.from(candidateUserIds) : Array.from(audience.people.keys());
  const out: AudiencePerson[] = [];
  for (const id of ids) {
    if (isExpectedForTemplate(audience, tpl, id)) out.push(audience.people.get(id)!);
  }
  return out;
}
