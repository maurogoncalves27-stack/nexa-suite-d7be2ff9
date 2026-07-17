import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Building2, ClipboardCheck, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface TemplateRow {
  id: string;
  weekdays: number[] | null;
  is_active: boolean;
  template_access_groups: { group_id: string }[];
}
interface SubmissionRow {
  id: string;
  template_id: string;
  user_id: string;
  checklist_answers: { checked: boolean; observation: string | null }[];
}
interface EmployeeRow {
  user_id: string | null;
  store_id: string;
  allocated_store_id: string | null;
}
interface UserGroupRow { user_id: string; group_id: string }

/**
 * Painel sempre visível na área do gestor:
 * mostra, por loja, o percentual de checklists ENVIADOS (envios feitos vs. esperados)
 * e a CONFORMIDADE (itens marcados vs. total de itens esperados) no dia atual.
 *
 * A vinculação template↔loja foi removida. Agora templates são atribuídos a
 * GRUPOS DE ACESSO. A loja de cada colaborador (allocated_store_id ou store_id)
 * é usada apenas para agregar as métricas por loja na visualização.
 */
export default function ChecklistsByStorePanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroupRow[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];
  const dow = new Date(today + "T12:00:00").getDay();

  useEffect(() => {
    const load = async () => {
      const [{ data: sto }, { data: tpl }, { data: subs }, { data: emps }, { data: ug }, { data: items }] =
        await Promise.all([
          supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
          supabase
            .from("checklist_templates")
            .select("id, weekdays, is_active, template_access_groups(group_id)")
            .eq("is_active", true),
          supabase
            .from("checklist_submissions")
            .select("id, template_id, user_id, checklist_answers(checked, observation)")
            .eq("shift_date", today),
          supabase
            .from("employees")
            .select("user_id, store_id, allocated_store_id")
            .eq("status", "active"),
          supabase.from("user_access_groups").select("user_id, group_id"),
          supabase.from("checklist_items").select("template_id"),
        ]);
      setStores(sortStores((sto ?? [])) as Store[]);
      setTemplates((tpl ?? []) as unknown as TemplateRow[]);
      setSubmissions((subs ?? []) as unknown as SubmissionRow[]);
      setEmployees((emps ?? []) as EmployeeRow[]);
      setUserGroups((ug ?? []) as UserGroupRow[]);
      const counts: Record<string, number> = {};
      (items ?? []).forEach((it: any) => {
        counts[it.template_id] = (counts[it.template_id] || 0) + 1;
      });
      setItemCounts(counts);
      setLoading(false);
    };
    load();
  }, [today]);

  const rows = useMemo(() => {
    return stores.map((store) => {
      // colaboradores ativos da loja (contratante OU alocados)
      const storeEmps = employees.filter(
        (e) => e.user_id && (e.store_id === store.id || e.allocated_store_id === store.id),
      );
      const userIds = new Set(storeEmps.map((e) => e.user_id!));

      // grupos a que esses colaboradores pertencem
      const storeGroupIds = new Set(
        userGroups.filter((g) => userIds.has(g.user_id)).map((g) => g.group_id),
      );

      // templates ativos para o dia da semana cujos grupos têm interseção com a loja
      const storeTemplates = templates.filter((t) => {
        const dayOk = !t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(dow);
        if (!dayOk) return false;
        return t.template_access_groups.some((g) => storeGroupIds.has(g.group_id));
      });
      const tplIds = new Set(storeTemplates.map((t) => t.id));

      // por colaborador, descobrir quais templates ele deveria fazer (via grupos dele)
      const userGroupMap = new Map<string, Set<string>>();
      userGroups.forEach((g) => {
        if (!userIds.has(g.user_id)) return;
        if (!userGroupMap.has(g.user_id)) userGroupMap.set(g.user_id, new Set());
        userGroupMap.get(g.user_id)!.add(g.group_id);
      });

      let expectedSubs = 0;
      let expectedItems = 0;
      storeEmps.forEach((emp) => {
        const gids = userGroupMap.get(emp.user_id!) ?? new Set();
        storeTemplates.forEach((t) => {
          const matches = t.template_access_groups.some((g) => gids.has(g.group_id));
          if (matches) {
            expectedSubs += 1;
            expectedItems += itemCounts[t.id] || 0;
          }
        });
      });

      const storeSubs = submissions.filter(
        (s) => tplIds.has(s.template_id) && userIds.has(s.user_id),
      );
      const sentPct = expectedSubs > 0 ? Math.round((storeSubs.length / expectedSubs) * 100) : 0;

      const checkedItems = storeSubs.reduce(
        (sum, s) =>
          sum +
          s.checklist_answers.filter(
            (a) => a.checked || (a.observation && a.observation.trim().length > 0),
          ).length,
        0,
      );
      const conformityPct =
        expectedItems > 0 ? Math.round((checkedItems / expectedItems) * 100) : 0;

      return {
        store,
        expectedSubs,
        sentSubs: storeSubs.length,
        sentPct,
        expectedItems,
        checkedItems,
        conformityPct,
        hasWork: expectedSubs > 0,
      };
    });
  }, [stores, templates, submissions, employees, userGroups, itemCounts, dow]);

  const visibleRows = rows.filter((r) => r.hasWork);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <span className="truncate">Check-lists hoje</span>
          <Badge variant="outline" className="hidden sm:inline-flex font-normal text-[10px] h-5 px-1.5">
            por loja
          </Badge>
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          <Link to="/checklists">
            <span className="hidden sm:inline">Abrir</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhuma loja com checklists ativos hoje.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visibleRows.map((r) => (
              <li key={r.store.id} className="py-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium truncate">{r.store.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[11px] tabular-nums">
                    <span className="text-muted-foreground">
                      {r.sentSubs}/{r.expectedSubs}
                    </span>
                    <span className="font-semibold text-foreground">{r.conformityPct}%</span>
                  </div>
                </div>
                <Progress value={r.conformityPct} className="h-1.5" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
