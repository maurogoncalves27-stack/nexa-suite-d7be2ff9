/**
 * Helpers para identificar lojas tipo "CD" (sem schema novo).
 * O CD é reconhecida pelo nome contendo "fabrica" / "CD".
 */
import { supabase } from "@/integrations/supabase/client";

export type RecipeScope = "fabrica" | "loja";

export const isFactoryName = (name?: string | null) =>
  !!name && (/f[áa]brica/i.test(name) || /\bcd\b/i.test(name));

/**
 * Determina o escopo das fichas técnicas que o funcionário pode produzir
 * com base na loja vinculada (store_id ou allocated_store_id).
 *
 * - Se a loja vinculada é a CD → "fabrica"
 * - Caso contrário (ou sem vínculo) → "loja"
 *
 * Admin e gestor recebem null (sem restrição).
 */
export const resolveUserRecipeScope = async (
  userId: string,
  opts: { isAdmin: boolean; isManager: boolean },
): Promise<RecipeScope | null> => {
  if (opts.isAdmin || opts.isManager) return null;

  const { data: emp } = await supabase
    .from("employees")
    .select("store_id, allocated_store_id, stores:store_id(name), allocated_store:allocated_store_id(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const names = [
    (emp as any)?.stores?.name,
    (emp as any)?.allocated_store?.name,
  ].filter(Boolean) as string[];

  return names.some(isFactoryName) ? "fabrica" : "loja";
};
