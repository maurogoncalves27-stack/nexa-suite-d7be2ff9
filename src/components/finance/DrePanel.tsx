import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileBarChart, RefreshCw } from "lucide-react";
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
import DreAllocatedPanel from "./DreAllocatedPanel";
import DreByStorePanel from "./DreByStorePanel";

type CategoryMap = Record<string, { dre_group: DreGroup | null; kind: string }>;

interface SaleRow { id: string; sold_at: string; total_amount: number; status: string; dre_excluded: boolean; order_number: string | null }
interface PayableRow {
  id: string;
  paid_at: string | null;
  amount: number;
  category_id: string | null;
  description: string | null;
  supplier_name: string | null;
  beneficiary: string | null;
  status: string;
}
interface ReceivableRow {
  id: string;
  received_at: string | null;
  amount: number;
  category_id: string | null;
  description: string;
  payer_name: string | null;
  status: string;
}

const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgoISO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

interface ComputeArgs {
  sales: SaleRow[];
  payables: PayableRow[];
  receivables: ReceivableRow[];
  catMap: CategoryMap;
  columnFor: (date: string) => string | null;
  columns: { key: string; label: string }[];
}

const computeDre = ({ sales, payables, receivables, catMap, columnFor, columns }: ComputeArgs): DreColumn[] => {
  const cols = new Map<string, DreColumn>(
    columns.map((c) => [c.key, emptyDreColumn(c.key, c.label)]),
  );

  for (const s of sales) {
    if (s.dre_excluded) continue;
    const key = columnFor(s.sold_at.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    const amt = Number(s.total_amount) || 0;
    if (s.status === "cancelled" || s.status === "refunded") {
      col.revenue_deduction += amt;
    } else {
      col.revenue_gross += amt;
    }
  }

  // Despesas — contas a pagar com status "paid"
  for (const p of payables) {
    if (p.status !== "paid" || !p.paid_at) continue;
    const key = columnFor(p.paid_at.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    const debit = Number(p.amount) || 0;
    const group = p.category_id ? catMap[p.category_id]?.dre_group ?? null : null;

    if (group === "excluded") continue;
    if (group === "non_operational") { col.non_operational -= debit; continue; }
    if (group === "revenue_deduction") { col.revenue_deduction += debit; continue; }
    if (group === "cmv") { col.cmv += debit; continue; }
    if (group === "expense_personnel") col.expense_personnel += debit;
    else if (group === "expense_admin") col.expense_admin += debit;
    else if (group === "expense_marketing") col.expense_marketing += debit;
    else if (group === "expense_financial") col.expense_financial += debit;
    else if (group === "expense_tax") col.expense_tax += debit;
    else col.expense_other += debit;
  }

  // Receitas extra-PDV — contas a receber com status "received"
  for (const r of receivables) {
    if (r.status !== "received" || !r.received_at) continue;
    const key = columnFor(r.received_at.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    const credit = Number(r.amount) || 0;
    const group = r.category_id ? catMap[r.category_id]?.dre_group ?? null : null;

    if (group === "excluded") continue;
    if (group === "non_operational") { col.non_operational += credit; continue; }
    if (group === "revenue_deduction") { col.revenue_deduction -= credit; continue; }
    // Padrão: trata como receita bruta adicional
    col.revenue_gross += credit;
  }

  return columns.map((c) => finalizeDreColumn(cols.get(c.key)!));
};

export default function DrePanel() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"monthly" | "custom" | "allocated" | "by_store">("monthly");
  const [monthsBack, setMonthsBack] = useState(6);
  const [customStart, setCustomStart] = useState(monthsAgoISO(0));
  const [customEnd, setCustomEnd] = useState(todayISO());

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [catMap, setCatMap] = useState<CategoryMap>({});

  const periodStart = useMemo(() => {
    if (tab === "monthly") return monthsAgoISO(monthsBack - 1);
    return customStart;
  }, [tab, monthsBack, customStart]);
  const periodEnd = useMemo(() => (tab === "monthly" ? todayISO() : customEnd), [tab, customEnd]);

  const load = async () => {
    setLoading(true);
    try {
      const [salesRes, payRes, recRes, catRes] = await Promise.all([
        supabase
          .from("pdv_orders")
          .select("id,concluded_at,total,status,dre_excluded,order_number")
          .in("status", ["concluded", "cancelled"])
          .gte("concluded_at", `${periodStart}T00:00:00`)
          .lte("concluded_at", `${periodEnd}T23:59:59`),
        supabase
          .from("accounts_payable")
          .select("id,paid_at,amount,category_id,description,supplier_name,beneficiary,status")
          .eq("status", "paid")
          .gte("paid_at", periodStart)
          .lte("paid_at", periodEnd),
        supabase
          .from("accounts_receivable")
          .select("id,received_at,amount,category_id,description,payer_name,status")
          .eq("status", "received")
          .gte("received_at", periodStart)
          .lte("received_at", periodEnd),
        supabase.from("finance_categories").select("id,dre_group,kind"),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (payRes.error) throw payRes.error;
      if (recRes.error) throw recRes.error;
      if (catRes.error) throw catRes.error;

      const cm: CategoryMap = {};
      for (const c of catRes.data ?? []) cm[c.id] = { dre_group: c.dre_group as DreGroup | null, kind: c.kind };

      setSales(((salesRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        sold_at: r.concluded_at ?? r.opened_at ?? new Date().toISOString(),
        total_amount: Number(r.total ?? 0),
        status: r.status,
        dre_excluded: !!r.dre_excluded,
        order_number: r.order_number ?? null,
      })) as SaleRow[]);
      setPayables((payRes.data ?? []) as PayableRow[]);
      setReceivables((recRes.data ?? []) as ReceivableRow[]);
      setCatMap(cm);
    } catch (e: any) {
      toast({ title: "Erro ao carregar DRE", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [periodStart, periodEnd]);

  const columns = useMemo<DreColumn[]>(() => {
    if (tab === "monthly") {
      const cols: { key: string; label: string }[] = [];
      const d = new Date();
      d.setDate(1);
      for (let i = monthsBack - 1; i >= 0; i--) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
        cols.push({ key, label: monthLabel(key) });
      }
      return computeDre({
        sales,
        payables,
        receivables,
        catMap,
        columnFor: (date) => {
          const k = monthKey(date);
          return cols.find((c) => c.key === k)?.key ?? null;
        },
        columns: cols,
      });
    }
    const cols = [{ key: "period", label: "Período selecionado" }];
    return computeDre({
      sales,
      payables,
      receivables,
      catMap,
      columnFor: () => "period",
      columns: cols,
    });
  }, [tab, monthsBack, sales, payables, receivables, catMap]);

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-base sm:text-lg"><FileBarChart className="h-4 w-4" /> DRE Gerencial</h3>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Receita pela data da venda no PDV. Despesas e receitas extras pelas contas a pagar/receber pagas (data de pagamento).
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex-wrap h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="monthly" className="text-xs sm:text-sm">Mensal</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs sm:text-sm">Período</TabsTrigger>
            <TabsTrigger value="by_store" className="text-xs sm:text-sm">Por loja</TabsTrigger>
            <TabsTrigger value="allocated" className="text-xs sm:text-sm">Rateado</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Meses exibidos</Label>
                <select
                  className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monthsBack}
                  onChange={(e) => setMonthsBack(Number(e.target.value))}
                >
                  {[3, 6, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Atualizar</span>
              </Button>
            </div>
            <DreTable columns={columns} loading={loading} />
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9" />
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Atualizar</span>
              </Button>
            </div>
            <DreTable columns={columns} loading={loading} />
          </TabsContent>

          <TabsContent value="by_store" className="space-y-3">
            <DreByStorePanel />
          </TabsContent>

          <TabsContent value="allocated" className="space-y-3">
            <DreAllocatedPanel />
          </TabsContent>
        </Tabs>

        <ExclusionsSection sales={sales} onChanged={load} />
      </CardContent>
    </Card>
  );
}

function ExclusionsSection({
  sales,
  onChanged,
}: {
  sales: SaleRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleSale = async (id: string, value: boolean) => {
    setBusyId(id);
    const { error } = await supabase.from("pdv_orders").update({ dre_excluded: value }).eq("id", id);
    setBusyId(null);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else onChanged();
  };

  const saleExcluded = sales.filter((s) => s.dre_excluded);
  const totalExcluded = saleExcluded.length;

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Gerenciar exclusões da DRE {totalExcluded > 0 && <span className="text-muted-foreground">({totalExcluded} excluídos)</span>}</span>
        <span className="text-muted-foreground text-xs">{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open && (
        <div className="p-3 space-y-4 border-t">
          <p className="text-xs text-muted-foreground">
            Despesas e receitas vêm das contas a pagar/receber pagas no período. Para excluí-las da DRE, cancele ou ajuste a categoria em <strong>Financeiro</strong>.
          </p>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Vendas do PDV no período</h4>
            <div className="max-h-64 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">Data</th>
                    <th className="text-left px-2 py-1.5">Pedido</th>
                    <th className="text-right px-2 py-1.5">Valor</th>
                    <th className="text-center px-2 py-1.5">Na DRE?</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-3 text-muted-foreground">Nenhuma venda.</td></tr>
                  ) : sales.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(s.sold_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-2 py-1.5">{s.order_number || s.id.slice(0, 8)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtBRL(s.total_amount)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <Button
                          size="sm"
                          variant={s.dre_excluded ? "outline" : "ghost"}
                          className="h-6 text-[11px] px-2"
                          disabled={busyId === s.id}
                          onClick={() => toggleSale(s.id, !s.dre_excluded)}
                        >
                          {s.dre_excluded ? "Excluído" : "Incluído"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowDef {
  label: string;
  field: keyof DreColumn;
  variant?: "header" | "subtotal" | "total" | "deduction" | "normal";
  refField?: keyof DreColumn; // base para %
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

function DreTable({ columns, loading }: { columns: DreColumn[]; loading: boolean }) {
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
  return (
    <>
      {/* Mobile: cards por coluna */}
      <div className="sm:hidden space-y-3">
        {columns.map((col) => (
          <div key={col.key} className="rounded-md border overflow-hidden">
            <div className="bg-primary/10 px-3 py-2 text-sm font-semibold">{col.label}</div>
            <div className="divide-y">
              {ROWS.map((row) => {
                const value = col[row.field] as number;
                const ref = row.refField ? (col[row.refField] as number) : undefined;
                return (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${rowClass(row.variant)}`}
                  >
                    <span className={row.indent ? "pl-3" : ""}>{row.label}</span>
                    <span className="text-right tabular-nums whitespace-nowrap">
                      {fmtBRL(value)}
                      {ref !== undefined && (
                        <span className="ml-1 text-[10px] text-muted-foreground">{pct(value, ref)}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/desktop: tabela */}
      <div className="hidden sm:block overflow-x-auto rounded-md border -mx-1 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-2 sm:px-3 py-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[140px] sm:min-w-[220px]">Linha</th>
              {columns.map((c) => (
                <th key={c.key} className="text-right px-2 sm:px-3 py-2 font-medium whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className={rowClass(row.variant)}>
                <td className={`px-2 sm:px-3 py-1.5 sticky left-0 z-10 ${rowBg(row.variant)} ${row.indent ? "pl-4 sm:pl-6" : ""}`}>
                  {row.label}
                </td>
                {columns.map((col) => {
                  const value = col[row.field] as number;
                  const ref = row.refField ? (col[row.refField] as number) : undefined;
                  return (
                    <td key={col.key} className="px-2 sm:px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
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
    </>
  );
}

const rowClass = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "font-semibold bg-primary/5";
    case "subtotal": return "font-medium bg-muted/30 border-y";
    case "total": return "font-bold bg-primary/10 border-y-2";
    case "deduction": return "text-rose-600 dark:text-rose-400";
    default: return "";
  }
};
const rowBg = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "bg-primary/5";
    case "subtotal": return "bg-muted/30";
    case "total": return "bg-primary/10";
    default: return "bg-card";
  }
};
