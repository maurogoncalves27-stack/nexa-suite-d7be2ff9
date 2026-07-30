import { supabase } from "@/integrations/supabase/client";

/**
 * Avaliação de desempenho é MENSAL e obrigatória.
 * Este helper garante que exista um ciclo mensal aberto cobrindo o mês corrente.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const monthBounds = (ref: Date = new Date()) => {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0);
  const end = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  return { start, end, label: `${pad(m + 1)}/${y}` };
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export interface MonthlyCycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** Busca (ou cria) o ciclo mensal aberto do mês corrente. Retorna null se não for possível criar. */
export async function ensureCurrentMonthlyCycle(): Promise<MonthlyCycle | null> {
  const { start, end, label } = monthBounds();

  const { data: existing } = await supabase
    .from("evaluation_cycles")
    .select("id, name, start_date, end_date")
    .eq("start_date", start)
    .eq("end_date", end)
    .limit(1);

  if (existing && existing.length > 0) return existing[0] as MonthlyCycle;

  const { data: created, error } = await supabase
    .from("evaluation_cycles")
    .insert({
      name: `Avaliação ${label}`,
      start_date: start,
      end_date: end,
      status: "open",
      periodicity: "monthly",
      bonus_value_per_point: 0,
    })
    .select("id, name, start_date, end_date")
    .maybeSingle();

  if (error) {
    // Sem permissão (ex.: colaborador comum) — apenas ignora
    return null;
  }
  return (created as MonthlyCycle) ?? null;
}
