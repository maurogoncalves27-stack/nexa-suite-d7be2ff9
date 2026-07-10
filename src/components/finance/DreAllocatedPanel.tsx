import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./_fetchAll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DRE_GROUP_LABELS,
  emptyDreColumn,
  finalizeDreColumn,
  fmtBRL,
  pct,
  type DreColumn,
  type DreGroup,
} from "@/lib/dre";
import {
  applySnapshotToColumn,
  fetchSnapshotAll,
  isHistoricalMonth,
  monthKey as snapMonthKey,
  monthsInRange,
  snapshotKeyForStoreName,
  type SnapshotByStoreMonth,
} from "@/lib/dreSnapshot";

type CategoryMap = Record<string, { dre_group: DreGroup | null; kind: string }>;

interface SaleRow { id: string; sold_at: string; total_amount: number; status: string; dre_excluded: boolean; store_id: string }
interface PayableRow { id: string; paid_at: string | null; due_date: string | null; competence_date: string | null; amount: number; category_id: string | null; status: string; store_id: string | null }
interface ReceivableRow { id: string; received_at: string | null; amount: number; category_id: string | null; status: string; store_id: string | null }
interface StoreRow { id: string; name: string; is_virtual: boolean }

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgoISO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

// Lojas físicas que recebem rateio (por nome, robusto a remapeamento de IDs)
const ALLOCATION_STORE_NAMES = ["ÁGUAS CLARAS", "ASA NORTE", "ASA SUL", "LAGO SUL"];
// Identificação da fábrica (por nome)
const FACTORY_STORE_NAMES = ["FABRICA", "FÁBRICA"];

const applyExpense = (col: DreColumn, group: DreGroup | null, debit: number) => {
  if (group === "excluded") return;
  if (group === "non_operational") { col.non_operational -= debit; return; }
  if (group === "revenue_deduction") { col.revenue_deduction += debit; return; }
  if (group === "cmv") { col.cmv += debit; return; }
  if (group === "expense_personnel") col.expense_personnel += debit;
  else if (group === "expense_admin") col.expense_admin += debit;
  else if (group === "expense_marketing") col.expense_marketing += debit;
  else if (group === "expense_financial") col.expense_financial += debit;
  else if (group === "expense_tax") col.expense_tax += debit;
  else col.expense_other += debit;
};

const applyReceivable = (col: DreColumn, group: DreGroup | null, credit: number) => {
  if (group === "excluded") return;
  if (group === "non_operational") { col.non_operational += credit; return; }
  if (group === "revenue_deduction") { col.revenue_deduction -= credit; return; }
  // Receita bruta já vem integralmente de monthly_revenue (/faturamento).
  // Contas a receber representam liquidação/cobrança e não devem duplicar faturamento.
};

export default function DreAllocatedPanel() {
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(monthsAgoISO(0));
  const [end, setEnd] = useState(todayISO());

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotByStoreMonth | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [storesRes, salesRes, payRes, recRes, catRes] = await Promise.all([
        supabase.from("stores").select("id,name,is_virtual"),
        fetchAllPaged((from, to) =>
          supabase
            .from("monthly_revenue")
            .select("id,year,month,day,gross_revenue,store_id")
            .gte("year", Number(start.slice(0, 4)))
            .lte("year", Number(end.slice(0, 4)))
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_payable")
            .select("id,paid_at,due_date,competence_date,amount,category_id,status,store_id")
            .neq("status", "cancelled")
            .or(`and(competence_date.gte.${start},competence_date.lte.${end}),and(competence_date.is.null,due_date.gte.${start},due_date.lte.${end})`)
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_receivable")
            .select("id,received_at,amount,category_id,status,store_id")
            .eq("status", "received")
            .gte("received_at", start)
            .lte("received_at", end)
            .range(from, to),
        ),
        supabase.from("finance_categories").select("id,dre_group,kind"),
      ]);

      if (storesRes.error) throw storesRes.error;
      if (salesRes.error) throw salesRes.error;
      if (payRes.error) throw payRes.error;
      if (recRes.error) throw recRes.error;
      if (catRes.error) throw catRes.error;

      const cm: CategoryMap = {};
      for (const c of catRes.data ?? []) cm[c.id] = { dre_group: c.dre_group as DreGroup | null, kind: c.kind };

      setStores((storesRes.data ?? []) as StoreRow[]);
      setSales(((salesRes.data ?? []) as any[])
        .map((r) => {
          const y = String(r.year).padStart(4, "0");
          const m = String(r.month).padStart(2, "0");
          const d = String(r.day ?? 1).padStart(2, "0");
          return {
            id: r.id,
            sold_at: `${y}-${m}-${d}`,
            total_amount: Number(r.gross_revenue ?? 0),
            status: "concluded",
            dre_excluded: false,
            store_id: r.store_id,
          };
        })
        .filter((r) => r.sold_at >= start && r.sold_at <= end) as SaleRow[]);

      setPayables((payRes.data ?? []) as PayableRow[]);
      setReceivables((recRes.data ?? []) as ReceivableRow[]);
      setCatMap(cm);
    } catch (e: any) {
      toast({ title: "Erro ao carregar visão rateada", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [start, end]);

  // Resolve quais ids são lojas-alvo do rateio e quais são fábrica.
  // Para evitar problema com lojas físicas vs virtuais de mesmo nome, usamos is_virtual=false.
  const allocationStoreIds = useMemo(() => {
    const map = new Map<string, string>(); // id -> name
    for (const s of stores) {
      if (s.is_virtual) continue;
      if (ALLOCATION_STORE_NAMES.includes(s.name.toUpperCase())) {
        map.set(s.id, s.name);
      }
    }
    return map;
  }, [stores]);

  const factoryStoreIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      if (s.is_virtual) continue;
      if (FACTORY_STORE_NAMES.includes(s.name.toUpperCase())) set.add(s.id);
    }
    return set;
  }, [stores]);

  // Mapeia venda virtual -> loja física via parent_store_id? Não temos aqui.
  // As vendas no PDV podem vir com store_id de loja virtual. Para simplificar
  // o rateio, agrupamos vendas por nome da loja (virtual ou física) e somamos
  // sob a loja física de mesmo nome, quando existir nas 4 alvo.
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.name.toUpperCase());
    return m;
  }, [stores]);

  const physicalIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, name] of allocationStoreIds.entries()) m.set(name.toUpperCase(), id);
    return m;
  }, [allocationStoreIds]);

  const resolveAllocationStoreId = (storeId: string | null): string | null => {
    if (!storeId) return null;
    if (allocationStoreIds.has(storeId)) return storeId;
    const name = storeNameById.get(storeId);
    if (!name) return null;
    return physicalIdByName.get(name) ?? null;
  };

  // Calcula colunas: uma por loja-alvo + coluna fábrica (informativa) + total
  const data = useMemo(() => {
    const cols = new Map<string, DreColumn>();
    for (const [id, name] of allocationStoreIds.entries()) {
      cols.set(id, emptyDreColumn(id, name));
    }
    const FACTORY_KEY = "__factory__";
    cols.set(FACTORY_KEY, emptyDreColumn(FACTORY_KEY, "FÁBRICA (rateado)"));

    // 1) Receita por loja (vendas)
    for (const s of sales) {
      if (s.dre_excluded) continue;
      const targetId = resolveAllocationStoreId(s.store_id);
      if (!targetId) continue;
      const col = cols.get(targetId)!;
      const amt = Number(s.total_amount) || 0;
      if (s.status === "cancelled" || s.status === "refunded") col.revenue_deduction += amt;
      else col.revenue_gross += amt;
    }

    // 2) Receitas extras (a receber) por loja
    for (const r of receivables) {
      if (r.status !== "received" || !r.received_at) continue;
      const targetId = resolveAllocationStoreId(r.store_id);
      if (!targetId) continue;
      const col = cols.get(targetId)!;
      const credit = Number(r.amount) || 0;
      const group = r.category_id ? catMap[r.category_id]?.dre_group ?? null : null;
      applyReceivable(col, group, credit);
    }

    // 3) Calcular % de rateio com base na receita BRUTA das 4 lojas
    const totalGross = Array.from(allocationStoreIds.keys())
      .reduce((sum, id) => sum + (cols.get(id)?.revenue_gross ?? 0), 0);
    const allocPct = new Map<string, number>();
    for (const id of allocationStoreIds.keys()) {
      const g = cols.get(id)!.revenue_gross;
      allocPct.set(id, totalGross > 0 ? g / totalGross : 1 / allocationStoreIds.size);
    }

    // 4) Despesas: separar fábrica (vai ser rateada) das próprias lojas (vão direto)
    const factoryCol = cols.get(FACTORY_KEY)!;

    for (const p of payables) {
      if (p.status === "cancelled") continue;
      if (!(p.competence_date ?? p.due_date)) continue;
      const debit = Number(p.amount) || 0;
      const group = p.category_id ? catMap[p.category_id]?.dre_group ?? null : null;

      // Despesa da fábrica → acumula em factoryCol e depois rateia
      if (p.store_id && factoryStoreIds.has(p.store_id)) {
        applyExpense(factoryCol, group, debit);
        continue;
      }

      // Despesa de loja-alvo → vai direto para a coluna da loja
      const targetId = resolveAllocationStoreId(p.store_id);
      if (targetId && cols.has(targetId)) {
        applyExpense(cols.get(targetId)!, group, debit);
        continue;
      }
      // Despesas sem store_id ou de outras lojas (ex: Estoque Central): rateia
      // junto com a fábrica (segue mesma regra de overhead).
      applyExpense(factoryCol, group, debit);
    }

    // 5) Distribuir factoryCol pelas lojas conforme allocPct
    const expenseFields: (keyof DreColumn)[] = [
      "revenue_deduction","cmv","expense_personnel","expense_admin",
      "expense_marketing","expense_financial","expense_tax","expense_other","non_operational",
    ];
    for (const id of allocationStoreIds.keys()) {
      const share = allocPct.get(id) ?? 0;
      const col = cols.get(id)!;
      for (const f of expenseFields) {
        (col[f] as number) += (factoryCol[f] as number) * share;
      }
    }

    // 6) Coluna de total consolidado
    const totalCol = emptyDreColumn("__total__", "TOTAL CONSOLIDADO");
    for (const id of allocationStoreIds.keys()) {
      const c = cols.get(id)!;
      for (const f of expenseFields) (totalCol[f] as number) += (c[f] as number);
      totalCol.revenue_gross += c.revenue_gross;
    }

    // Finaliza todas
    const storeColumns = Array.from(allocationStoreIds.keys()).map((id) => finalizeDreColumn(cols.get(id)!));
    const factoryFinal = finalizeDreColumn(factoryCol);
    const totalFinal = finalizeDreColumn(totalCol);

    return { storeColumns, factoryCol: factoryFinal, totalCol: totalFinal, allocPct };
  }, [sales, payables, receivables, catMap, allocationStoreIds, factoryStoreIds, storeNameById, physicalIdByName]);

  const allColumns = useMemo<DreColumn[]>(
    () => [...data.storeColumns, data.totalCol],
    [data],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Atualizar</span>
        </Button>
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Despesas pagas da <strong>FÁBRICA</strong> (e de lojas sem destinação direta) são rateadas entre
        as 4 lojas físicas conforme o <strong>% de faturamento bruto</strong> do período. Despesas com
        store_id de uma das 4 lojas vão direto para a coluna dela.
      </div>

      <AllocationSummary
        allocPct={data.allocPct}
        storeNames={Array.from(data.allocPct.keys()).map((id) => ({
          id,
          name: allocationStoreIds.get(id) ?? id,
        }))}
        factoryCol={data.factoryCol}
      />

      <DreTable columns={allColumns} loading={loading} highlightLastCol />
    </div>
  );
}

function AllocationSummary({
  allocPct,
  storeNames,
  factoryCol,
}: {
  allocPct: Map<string, number>;
  storeNames: { id: string; name: string }[];
  factoryCol: DreColumn;
}) {
  const totalFactoryExpense =
    factoryCol.cmv + factoryCol.expense_personnel + factoryCol.expense_admin +
    factoryCol.expense_marketing + factoryCol.expense_other +
    factoryCol.expense_financial + factoryCol.expense_tax +
    factoryCol.revenue_deduction - factoryCol.non_operational;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        % de rateio aplicado · Total a ratear: <span className="text-foreground tabular-nums">{fmtBRL(totalFactoryExpense)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {storeNames.map(({ id, name }) => {
          const p = allocPct.get(id) ?? 0;
          return (
            <div key={id} className="rounded border bg-background px-2 py-1.5">
              <div className="text-[11px] text-muted-foreground truncate">{name}</div>
              <div className="text-sm font-semibold tabular-nums">{(p * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                + {fmtBRL(totalFactoryExpense * p)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RowDef {
  label: string;
  field: keyof DreColumn;
  variant?: "header" | "subtotal" | "total" | "deduction" | "normal";
  refField?: keyof DreColumn;
  indent?: boolean;
}

const ROWS: RowDef[] = [
  { label: "Receita bruta", field: "revenue_gross", variant: "header" },
  { label: "(−) Deduções", field: "revenue_deduction", variant: "deduction", indent: true },
  { label: "= Receita líquida", field: "revenue_net", variant: "subtotal", refField: "revenue_gross" },
  { label: "(−) CMV", field: "cmv", variant: "deduction" },
  { label: "= Lucro bruto", field: "gross_profit", variant: "subtotal", refField: "revenue_net" },
  { label: DRE_GROUP_LABELS.expense_personnel, field: "expense_personnel", variant: "deduction", indent: true },
  { label: DRE_GROUP_LABELS.expense_admin, field: "expense_admin", variant: "deduction", indent: true },
  { label: DRE_GROUP_LABELS.expense_marketing, field: "expense_marketing", variant: "deduction", indent: true },
  { label: DRE_GROUP_LABELS.expense_other, field: "expense_other", variant: "deduction", indent: true },
  { label: "(−) Despesas operacionais", field: "operational_total", variant: "subtotal" },
  { label: "= EBITDA", field: "ebitda", variant: "subtotal", refField: "revenue_net" },
  { label: "(−) Despesas financeiras", field: "expense_financial", variant: "deduction", indent: true },
  { label: "(−) Impostos", field: "expense_tax", variant: "deduction", indent: true },
  { label: "(±) Resultado não operacional", field: "non_operational", variant: "normal", indent: true },
  { label: "= Resultado líquido", field: "net_result", variant: "total", refField: "revenue_net" },
];

function DreTable({ columns, loading, highlightLastCol }: { columns: DreColumn[]; loading: boolean; highlightLastCol?: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>;
  }
  const lastIdx = columns.length - 1;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[140px] sm:min-w-[220px]">Linha</th>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className={`text-right px-3 py-2 font-medium whitespace-nowrap ${
                  highlightLastCol && i === lastIdx ? "bg-primary/10 text-foreground" : ""
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className={rowClass(row.variant)}>
              <td className={`px-3 py-1.5 sticky left-0 z-10 ${rowBg(row.variant)} ${row.indent ? "pl-6" : ""}`}>
                {row.label}
              </td>
              {columns.map((col, i) => {
                const value = col[row.field] as number;
                const ref = row.refField ? (col[row.refField] as number) : undefined;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${
                      highlightLastCol && i === lastIdx ? "bg-primary/5 font-medium" : ""
                    }`}
                  >
                    <div>{fmtBRL(value)}</div>
                    {ref !== undefined && (
                      <div className="text-[10px] text-muted-foreground">{pct(value, ref)}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const rowClass = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "font-semibold bg-primary/5";
    case "subtotal": return "font-medium bg-muted/30 border-y";
    case "total": return "font-bold bg-primary/10 border-y-2 border-primary/40";
    default: return "border-t";
  }
};
const rowBg = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "bg-primary/5";
    case "subtotal": return "bg-muted/30";
    case "total": return "bg-primary/10";
    default: return "bg-background";
  }
};
