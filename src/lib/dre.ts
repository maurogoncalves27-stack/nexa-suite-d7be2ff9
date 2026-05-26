export type DreGroup =
  | "revenue_gross"
  | "revenue_deduction"
  | "cmv"
  | "expense_personnel"
  | "expense_admin"
  | "expense_marketing"
  | "expense_financial"
  | "expense_tax"
  | "expense_other"
  | "non_operational"
  | "excluded";

export const DRE_GROUP_LABELS: Record<DreGroup, string> = {
  revenue_gross: "Receita bruta",
  revenue_deduction: "Deduções da receita",
  cmv: "Custo da mercadoria vendida (CMV)",
  expense_personnel: "Despesas com pessoal",
  expense_admin: "Despesas administrativas",
  expense_marketing: "Despesas com marketing",
  expense_financial: "Despesas financeiras",
  expense_tax: "Impostos",
  expense_other: "Outras despesas operacionais",
  non_operational: "Resultado não operacional",
  excluded: "Excluído da DRE",
};

export const DRE_GROUP_OPTIONS: { value: DreGroup; label: string; kind: "income" | "expense" | "any" }[] = [
  { value: "revenue_gross", label: DRE_GROUP_LABELS.revenue_gross, kind: "income" },
  { value: "revenue_deduction", label: DRE_GROUP_LABELS.revenue_deduction, kind: "any" },
  { value: "cmv", label: DRE_GROUP_LABELS.cmv, kind: "expense" },
  { value: "expense_personnel", label: DRE_GROUP_LABELS.expense_personnel, kind: "expense" },
  { value: "expense_admin", label: DRE_GROUP_LABELS.expense_admin, kind: "expense" },
  { value: "expense_marketing", label: DRE_GROUP_LABELS.expense_marketing, kind: "expense" },
  { value: "expense_financial", label: DRE_GROUP_LABELS.expense_financial, kind: "expense" },
  { value: "expense_tax", label: DRE_GROUP_LABELS.expense_tax, kind: "expense" },
  { value: "expense_other", label: DRE_GROUP_LABELS.expense_other, kind: "expense" },
  { value: "non_operational", label: DRE_GROUP_LABELS.non_operational, kind: "any" },
  { value: "excluded", label: DRE_GROUP_LABELS.excluded, kind: "any" },
];

export interface DreColumn {
  key: string;
  label: string;
  // Receita
  revenue_gross: number;
  revenue_deduction: number;
  revenue_net: number;
  // CMV / lucro bruto
  cmv: number;
  gross_profit: number;
  // Operacionais
  expense_personnel: number;
  expense_admin: number;
  expense_marketing: number;
  expense_other: number;
  operational_total: number;
  ebitda: number;
  // Financeiras / impostos
  expense_financial: number;
  expense_tax: number;
  // Não operacional
  non_operational: number;
  // Resultado
  net_result: number;
}

export const emptyDreColumn = (key: string, label: string): DreColumn => ({
  key,
  label,
  revenue_gross: 0,
  revenue_deduction: 0,
  revenue_net: 0,
  cmv: 0,
  gross_profit: 0,
  expense_personnel: 0,
  expense_admin: 0,
  expense_marketing: 0,
  expense_other: 0,
  operational_total: 0,
  ebitda: 0,
  expense_financial: 0,
  expense_tax: 0,
  non_operational: 0,
  net_result: 0,
});

export const finalizeDreColumn = (col: DreColumn): DreColumn => {
  col.revenue_net = col.revenue_gross - col.revenue_deduction;
  col.gross_profit = col.revenue_net - col.cmv;
  col.operational_total =
    col.expense_personnel + col.expense_admin + col.expense_marketing + col.expense_other;
  col.ebitda = col.gross_profit - col.operational_total;
  col.net_result = col.ebitda - col.expense_financial - col.expense_tax + col.non_operational;
  return col;
};

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pct = (num: number, den: number) =>
  den === 0 ? "—" : `${((num / den) * 100).toFixed(1)}%`;
