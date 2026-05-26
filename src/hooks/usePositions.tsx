import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Position {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  cbo_code?: string | null;
  cbo_title?: string | null;
}

/**
 * Hook compartilhado: lista oficial de cargos da empresa.
 * Fonte única de verdade — tabela `positions` no banco.
 *
 * @param onlyActive (default true) — retorna apenas cargos ativos
 */
export function usePositions(onlyActive = true) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("positions")
      .select("id, name, sort_order, is_active, cbo_code, cbo_title")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (onlyActive) q = q.eq("is_active", true);
    const { data } = await q;
    setPositions((data ?? []) as Position[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [onlyActive]);

  return { positions, loading, reload: load };
}
