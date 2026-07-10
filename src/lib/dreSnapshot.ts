import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/components/finance/_fetchAll";
import { emptyDreColumn, finalizeDreColumn, type DreColumn } from "@/lib/dre";

/**
 * Snapshot histórico da DRE (importado das planilhas do contador, jan/23 → abr/26).
 * A partir de mai/2026 usamos apenas o cálculo ao vivo do sistema.
 */
export const HIST_CUTOFF = "2026-04"; // YYYY-MM inclusive
export const isHistoricalMonth = (key: string) => key <= HIST_CUTOFF;
export const monthKey = (iso: string) => iso.slice(0, 7);

// store_key usado em public.dre_historical_snapshot
export type SnapshotStoreKey = "consolidated" | "ASN" | "ASS" | "AGC" | "LGS";

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const STORE_NAME_TO_SNAPSHOT: Record<string, SnapshotStoreKey> = {
  "ASA NORTE": "ASN",
  "ASA SUL": "ASS",
  "AGUAS CLARAS": "AGC",
  "LAGO SUL": "LGS",
};

export const snapshotKeyForStoreName = (name: string): SnapshotStoreKey | null =>
  STORE_NAME_TO_SNAPSHOT[normalize(name)] ?? null;

export type SnapshotByMonth = Record<string, Record<string, number>>;
export type SnapshotByStoreMonth = Record<SnapshotStoreKey, SnapshotByMonth>;

const FIELD_MAP: Record<string, keyof DreColumn> = {
  revenue_gross: "revenue_gross",
  revenue_deduction: "revenue_deduction",
  cmv: "cmv",
  expense_personnel: "expense_personnel",
  expense_admin: "expense_admin",
  expense_marketing: "expense_marketing",
  expense_financial: "expense_financial",
  expense_tax: "expense_tax",
  expense_other: "expense_other",
  non_operational: "non_operational",
};

export const applySnapshotToColumn = (
  col: DreColumn,
  values: Record<string, number> | undefined,
) => {
  if (!values) return;
  for (const [line, amount] of Object.entries(values)) {
    const field = FIELD_MAP[line];
    if (!field) continue;
    (col as any)[field] += Number(amount) || 0;
  }
};

export const snapshotColumn = (
  key: string,
  label: string,
  monthKeys: string[],
  snap: SnapshotByMonth,
): DreColumn => {
  const col = emptyDreColumn(key, label);
  for (const m of monthKeys) applySnapshotToColumn(col, snap[m]);
  return finalizeDreColumn(col);
};

export const monthsInRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

/** Busca todo snapshot histórico agrupado por store_key/mês. */
export const fetchSnapshotAll = async (): Promise<SnapshotByStoreMonth> => {
  const res = await fetchAllPaged((from, to) =>
    supabase
      .from("dre_historical_snapshot" as any)
      .select("year,month,store_key,line_key,amount")
      .range(from, to),
  );
  const acc: SnapshotByStoreMonth = {
    consolidated: {}, ASN: {}, ASS: {}, AGC: {}, LGS: {},
  };
  for (const row of ((res.data ?? []) as any[])) {
    const sk = row.store_key as SnapshotStoreKey;
    if (!acc[sk]) continue;
    const mk = `${row.year}-${String(row.month).padStart(2, "0")}`;
    (acc[sk][mk] ??= {})[row.line_key] = Number(row.amount) || 0;
  }
  return acc;
};

/** Rótulo curto do mês (jan/25) — utilitário compartilhado. */
export const monthLabelBR = (key: string) => {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};
