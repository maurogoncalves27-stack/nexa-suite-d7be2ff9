import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve o nome de exibição de usuários priorizando o nome do cadastro
 * (employees.full_name) sobre o nome do perfil de login (profiles.full_name),
 * que pode ser um apelido definido pelo próprio usuário no cadastro/Google.
 */
export async function fetchDisplayNames(userIds?: string[]): Promise<Record<string, string>> {
  const ids = userIds ? [...new Set(userIds.filter(Boolean))] : undefined;
  if (ids && ids.length === 0) return {};

  let profileQuery = supabase.from("profiles").select("user_id, full_name");
  let employeeQuery = supabase.from("employees").select("user_id, full_name").not("user_id", "is", null);
  if (ids) {
    profileQuery = profileQuery.in("user_id", ids);
    employeeQuery = employeeQuery.in("user_id", ids);
  }

  const [{ data: profiles }, { data: employees }] = await Promise.all([profileQuery, employeeQuery]);

  const map: Record<string, string> = {};
  (profiles ?? []).forEach((p: any) => {
    if (p.full_name) map[p.user_id] = p.full_name;
  });
  // employees sobrescreve o perfil (fonte oficial do nome)
  (employees ?? []).forEach((e: any) => {
    if (e.user_id && e.full_name) map[e.user_id] = e.full_name;
  });
  return map;
}
