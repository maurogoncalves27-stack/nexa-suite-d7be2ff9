import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna o conjunto de employee_ids que bateram ponto na loja `storeId`
 * dentro do período [from, to]. Vazio quando storeId === "all".
 *
 * Usado para permitir que colaboradores que transitam entre lojas apareçam
 * nos filtros por loja das telas de RH (Batidas, Tratativas, Fechamento,
 * Escala × Ponto, Afastamentos), além dos vinculados/allocated pela loja.
 */
export function useEmployeesAtStore(storeId: string, from: string, to: string) {
  const [punchedIds, setPunchedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!storeId || storeId === "all" || !from || !to) {
      setPunchedIds(new Set());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("time_clock_entries")
        .select("employee_id")
        .eq("store_id", storeId)
        .gte("reference_date", from)
        .lte("reference_date", to)
        .limit(5000);
      if (cancelled) return;
      setPunchedIds(new Set((data ?? []).map((r: any) => r.employee_id).filter(Boolean)));
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, from, to]);

  return punchedIds;
}
