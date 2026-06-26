import { supabase } from "@/integrations/supabase/client";

/**
 * Busca todas as linhas de uma tabela em páginas de 1000 (limite do PostgREST),
 * aplicando os filtros recebidos via callback. Necessário porque o servidor
 * Supabase capa o resultado em ~1000 linhas mesmo quando o cliente passa
 * `.limit(50000)` — então maio/junho da DRE eram truncados silenciosamente.
 */
export async function fetchAllPaged<T = any>(
  build: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + pageSize - 1;
    const res = await build(from, to);
    if (res.error) return { data: all, error: res.error };
    const rows = (res.data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 200000) break; // safety
  }
  return { data: all, error: null };
}

// re-export para conveniência
export { supabase };
