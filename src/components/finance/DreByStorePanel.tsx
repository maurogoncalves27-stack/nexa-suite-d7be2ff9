import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

type CategoryMap = Record<string, { dre_group: DreGroup | null; kind: string }>;

interface SaleRow { id: string; sold_at: string; total_amount: number; status: string; dre_excluded: boolean; store_id: string }
interface PayableRow { id: string; paid_at: string | null; amount: number; category_id: string | null; status: string; store_id: string | null }
interface ReceivableRow { id: string; received_at: string | null; amount: number; category_id: string | null; status: string; store_id: string | null }
interface StoreRow { id: string; name: string; is_virtual: boolean }

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgoISO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const FACTORY_NAMES = ["FABRICA", "FÁBRICA"];

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
  col.revenue_gross += credit;
};

export default function DreByStorePanel() {
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState(monthsAgoISO(0));
  const [end, setEnd] = useState(todayISO());
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [includeFactoryShare, setIncludeFactoryShare] = useState(true);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [catMap, setCatMap] = useState<CategoryMap>({});

  const load = async () => {
    setLoading(true);
    try {
      const [storesRes, salesRes, payRes, recRes, catRes] = await Promise.all([
        supabase.from("stores").select("id,name,is_virtual"),
        supabase
          .from("pdv_orders")
          .select("id,concluded_at,total,status,dre_excluded,store_id")
          .in("status", ["concluded", "cancelled"])
          .gte("concluded_at", `${start}T00:00:00`)
          .lte("concluded_at", `${end}T23:59:59`),
        supabase
          .from("accounts_payable")
          .select("id,paid_at,amount,category_id,status,store_id")
          .eq("status", "paid")
          .gte("paid_at", start)
          .lte("paid_at", end),
        supabase
          .from("accounts_receivable")
          .select("id,received_at,amount,category_id,status,store_id")
          .eq("status", "received")
          .gte("received_at", start)
          .lte("received_at", end),
        supabase.from("finance_categories").select("id,dre_group,kind"),
      ]);

      if (storesRes.error) throw storesRes.error;
      if (salesRes.error) throw salesRes.error;
      if (payRes.error) throw payRes.error;
      if (recRes.error) throw recRes.error;
      if (catRes.error) throw catRes.error;

      const cm: CategoryMap = {};
      for (const c of catRes.data ?? []) cm[c.id] = { dre_group: c.dre_group as DreGroup | null, kind: c.kind };

      const physical = ((storesRes.data ?? []) as StoreRow[]).filter((s) => !s.is_virtual);
      setStores(physical);
      if (!selectedStoreId && physical.length) {
        const firstNonFactory = physical.find((s) => !FACTORY_NAMES.includes(s.name.toUpperCase())) ?? physical[0];
        setSelectedStoreId(firstNonFactory.id);
      }
      setSales(((salesRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        sold_at: r.concluded_at ?? new Date().toISOString(),
        total_amount: Number(r.total ?? 0),
        status: r.status,
        dre_excluded: !!r.dre_excluded,
        store_id: r.store_id,
      })) as SaleRow[]);
      setPayables((payRes.data ?? []) as PayableRow[]);
      setReceivables((recRes.data ?? []) as ReceivableRow[]);
      setCatMap(cm);
    } catch (e: any) {
      toast({ title: "Erro ao carregar DRE da loja", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [start, end]);

  // Resolve venda (loja virtual) -> loja física pelo nome
  const physicalIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.name.toUpperCase(), s.id);
    return m;
  }, [stores]);

  // Mapa para todas as lojas (para resolver vendas com store_id virtual: precisa da lista completa de stores incl. virtuais).
  // Mas como buscamos só físicas no setStores, precisamos buscar virtuais para resolver nomes.
  const [allStores, setAllStores] = useState<StoreRow[]>([]);
  useEffect(() => {
    supabase.from("stores").select("id,name,is_virtual").then((res) => {
      if (!res.error) setAllStores((res.data ?? []) as StoreRow[]);
    });
  }, []);
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allStores) m.set(s.id, s.name.toUpperCase());
    return m;
  }, [allStores]);

  const factoryStoreIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStores) {
      if (s.is_virtual) continue;
      if (FACTORY_NAMES.includes(s.name.toUpperCase())) set.add(s.id);
    }
    return set;
  }, [allStores]);

  const resolveStoreId = (storeId: string | null): string | null => {
    if (!storeId) return null;
    if (physicalIdByName.size === 0) return storeId;
    const name = storeNameById.get(storeId);
    if (!name) return storeId;
    return physicalIdByName.get(name) ?? storeId;
  };

  const selectedIsFactory = useMemo(
    () => !!selectedStoreId && factoryStoreIds.has(selectedStoreId),
    [selectedStoreId, factoryStoreIds],
  );

  const data = useMemo(() => {
    if (!selectedStoreId) return null;

    const selectedName = stores.find((s) => s.id === selectedStoreId)?.name ?? "Loja";
    const col = emptyDreColumn(selectedStoreId, selectedName);

    // Vendas da loja selecionada (mapeando virtuais para físicas pelo nome)
    for (const s of sales) {
      if (s.dre_excluded) continue;
      const tid = resolveStoreId(s.store_id);
      if (tid !== selectedStoreId) continue;
      const amt = Number(s.total_amount) || 0;
      if (s.status === "cancelled" || s.status === "refunded") col.revenue_deduction += amt;
      else col.revenue_gross += amt;
    }

    // Receitas extras
    for (const r of receivables) {
      if (r.status !== "received" || !r.received_at) continue;
      const tid = resolveStoreId(r.store_id);
      if (tid !== selectedStoreId) continue;
      const credit = Number(r.amount) || 0;
      const group = r.category_id ? catMap[r.category_id]?.dre_group ?? null : null;
      applyReceivable(col, group, credit);
    }

    // Despesas diretas da loja
    for (const p of payables) {
      if (p.status !== "paid" || !p.paid_at) continue;
      const tid = resolveStoreId(p.store_id);
      if (tid !== selectedStoreId) continue;
      const debit = Number(p.amount) || 0;
      const group = p.category_id ? catMap[p.category_id]?.dre_group ?? null : null;
      applyExpense(col, group, debit);
    }

    // Calcular rateio da fábrica (opcional, só se loja não é fábrica)
    let factoryShare = 0;
    let allocPctValue = 0;
    let factoryTotal = 0;
    if (includeFactoryShare && !selectedIsFactory) {
      // Receita bruta de cada loja física (não fábrica) para calcular o %
      const grossByStore = new Map<string, number>();
      for (const s of stores) {
        if (FACTORY_NAMES.includes(s.name.toUpperCase())) continue;
        grossByStore.set(s.id, 0);
      }
      for (const s of sales) {
        if (s.dre_excluded) continue;
        const tid = resolveStoreId(s.store_id);
        if (!tid || !grossByStore.has(tid)) continue;
        const amt = Number(s.total_amount) || 0;
        if (s.status === "cancelled" || s.status === "refunded") continue;
        grossByStore.set(tid, (grossByStore.get(tid) ?? 0) + amt);
      }
      const totalGross = Array.from(grossByStore.values()).reduce((a, b) => a + b, 0);
      const myGross = grossByStore.get(selectedStoreId) ?? 0;
      allocPctValue = totalGross > 0 ? myGross / totalGross : 0;

      // Acumula despesas da fábrica
      const factoryCol = emptyDreColumn("__f__", "Fábrica");
      for (const p of payables) {
        if (p.status !== "paid" || !p.paid_at) continue;
        const isFactory = p.store_id && factoryStoreIds.has(p.store_id);
        const tid = resolveStoreId(p.store_id);
        const isAssignedToPhysical = tid && grossByStore.has(tid);
        if (!isFactory && isAssignedToPhysical) continue;
        // Fábrica ou sem destinação direta: rateia
        const debit = Number(p.amount) || 0;
        const group = p.category_id ? catMap[p.category_id]?.dre_group ?? null : null;
        applyExpense(factoryCol, group, debit);
      }

      const expenseFields: (keyof DreColumn)[] = [
        "revenue_deduction","cmv","expense_personnel","expense_admin",
        "expense_marketing","expense_financial","expense_tax","expense_other","non_operational",
      ];
      for (const f of expenseFields) {
        (col[f] as number) += (factoryCol[f] as number) * allocPctValue;
      }
      factoryTotal =
        factoryCol.cmv + factoryCol.expense_personnel + factoryCol.expense_admin +
        factoryCol.expense_marketing + factoryCol.expense_other +
        factoryCol.expense_financial + factoryCol.expense_tax +
        factoryCol.revenue_deduction - factoryCol.non_operational;
      factoryShare = factoryTotal * allocPctValue;
    }

    return {
      column: finalizeDreColumn(col),
      allocPct: allocPctValue,
      factoryShare,
      factoryTotal,
    };
  }, [selectedStoreId, sales, payables, receivables, catMap, stores, includeFactoryShare, selectedIsFactory]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Loja</Label>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />
        </div>
        {!selectedIsFactory && (
          <div className="flex items-center gap-2 h-9">
            <Switch
              id="alloc-factory"
              checked={includeFactoryShare}
              onCheckedChange={setIncludeFactoryShare}
            />
            <Label htmlFor="alloc-factory" className="text-xs cursor-pointer">
              Incluir rateio da fábrica
            </Label>
          </div>
        )}
      </div>

      {includeFactoryShare && !selectedIsFactory && data && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Esta loja representa <strong>{(data.allocPct * 100).toFixed(1)}%</strong> do faturamento bruto das lojas físicas no período.
          Despesas rateadas da fábrica: <strong className="text-foreground">{fmtBRL(data.factoryShare)}</strong>.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Selecione uma loja.</p>
      ) : (
        <DreSingleTable column={data.column} />
      )}
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

const rowClass = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "font-semibold bg-primary/5";
    case "subtotal": return "font-medium bg-muted/30";
    case "total": return "font-bold bg-primary/10";
    default: return "";
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

function DreSingleTable({ column }: { column: DreColumn }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[140px] sm:min-w-[220px]">Linha</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap">{column.label}</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const value = column[row.field] as number;
            const ref = row.refField ? (column[row.refField] as number) : undefined;
            return (
              <tr key={row.label} className={rowClass(row.variant)}>
                <td className={`px-3 py-1.5 sticky left-0 z-10 ${rowBg(row.variant)} ${row.indent ? "pl-6" : ""}`}>
                  {row.label}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  <div>{fmtBRL(value)}</div>
                  {ref !== undefined && (
                    <div className="text-[10px] text-muted-foreground">{pct(value, ref)}</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
