import { useEffect, useMemo, useState } from "react";
import { Gauge, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Categorias financeiras conhecidas (Água, Luz, Gás)
const CATEG_AGUA = "3e964f5d-84fa-445b-832a-40b0118351c7";
const CATEG_LUZ = "5f5803ab-d8eb-439d-b82d-e42d3e413c36";
const CATEG_GAS = "58c72c4a-fd1b-431d-b205-36f1333a62f9";
const CATEG_VALE_GAS = "409dbcd7-379a-4b06-85c7-1bf92ef815c3";

// Lojas físicas de operação (sem Escritório, Estoque Central, Fábrica)
const STORE_ORDER = ["ASA NORTE", "ÁGUAS CLARAS", "ASA SUL", "LAGO SUL"];

// Paleta fixa do sistema (HSL via tokens)
const STORE_COLOR: Record<string, string> = {
  "ASA NORTE": "hsl(var(--success))",
  "ÁGUAS CLARAS": "hsl(var(--primary))",
  "ASA SUL": "hsl(var(--warning))",
  "LAGO SUL": "hsl(340 82% 60%)",
};

type Store = { id: string; name: string };

type Row = {
  storeId: string;
  storeName: string;
  faturamento: number;
  aguaValor: number;
  luzValor: number;
  gasValor: number;
  gasBotijoes: number;
  oleoTrocas: number;
};

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";

function firstDayOfMonth(y: number, m: number) {
  return new Date(y, m - 1, 1).toISOString().slice(0, 10);
}
function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

export default function ConsumoLojas() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState<"brl" | "pct">("brl");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function load() {
    setLoading(true);
    try {
      const from = firstDayOfMonth(year, month);
      const to = lastDayOfMonth(year, month);

      const [storesRes, revRes, apRes, gasPurRes, gasReqRes, oilRes] = await Promise.all([
        supabase.from("stores").select("id,name").eq("is_virtual", false),
        supabase
          .from("monthly_revenue")
          .select("store_id, gross_revenue")
          .eq("year", year)
          .eq("month", month),
        supabase
          .from("accounts_payable")
          .select("store_id, category_id, amount")
          .in("category_id", [CATEG_AGUA, CATEG_LUZ, CATEG_GAS, CATEG_VALE_GAS])
          .gte("competence_date", from)
          .lte("competence_date", to),
        supabase
          .from("gas_voucher_purchases")
          .select("id, total_amount, quantity, unit_price, purchased_at")
          .gte("purchased_at", from)
          .lte("purchased_at", to),
        supabase
          .from("gas_voucher_requests")
          .select("store_id, received_at, status")
          .eq("status", "received")
          .gte("received_at", `${from}T00:00:00`)
          .lte("received_at", `${to}T23:59:59`),
        supabase
          .from("nutri_oil_quality_records")
          .select("store_id, date, changed")
          .eq("changed", true)
          .gte("date", from)
          .lte("date", to),
      ]);

      if (storesRes.error) throw storesRes.error;
      const stores = (storesRes.data ?? []).filter((s) =>
        STORE_ORDER.includes(s.name),
      ) as Store[];

      // Faturamento por loja
      const revenueByStore = new Map<string, number>();
      (revRes.data ?? []).forEach((r) => {
        revenueByStore.set(
          r.store_id,
          (revenueByStore.get(r.store_id) ?? 0) + Number(r.gross_revenue || 0),
        );
      });

      // Contas a pagar por loja+categoria
      const aguaByStore = new Map<string, number>();
      const luzByStore = new Map<string, number>();
      const gasApByStore = new Map<string, number>();
      (apRes.data ?? []).forEach((r) => {
        const amount = Number(r.amount || 0);
        if (!r.store_id) return;
        if (r.category_id === CATEG_AGUA) {
          aguaByStore.set(r.store_id, (aguaByStore.get(r.store_id) ?? 0) + amount);
        } else if (r.category_id === CATEG_LUZ) {
          luzByStore.set(r.store_id, (luzByStore.get(r.store_id) ?? 0) + amount);
        } else if (r.category_id === CATEG_GAS || r.category_id === CATEG_VALE_GAS) {
          gasApByStore.set(r.store_id, (gasApByStore.get(r.store_id) ?? 0) + amount);
        }
      });

      // Gás: usar purchases via requests recebidos (com store_id).
      const purchaseMap = new Map(
        (gasPurRes.data ?? []).map((p) => [
          p.id,
          {
            unit: Number(p.quantity || 0) > 0 ? Number(p.total_amount || 0) / Number(p.quantity) : 0,
            perUnitQty: 1,
          },
        ]),
      );
      const gasBtjByStore = new Map<string, number>();
      const gasValorByStore = new Map<string, number>();
      (gasReqRes.data ?? []).forEach((r) => {
        if (!r.store_id || !r.purchase_id) return;
        const p = purchaseMap.get(r.purchase_id);
        if (!p) return;
        gasBtjByStore.set(r.store_id, (gasBtjByStore.get(r.store_id) ?? 0) + 1);
        gasValorByStore.set(r.store_id, (gasValorByStore.get(r.store_id) ?? 0) + p.unit);
      });

      // Óleo: nº de trocas
      const oleoByStore = new Map<string, number>();
      (oilRes.data ?? []).forEach((r) => {
        if (!r.store_id) return;
        oleoByStore.set(r.store_id, (oleoByStore.get(r.store_id) ?? 0) + 1);
      });

      const out: Row[] = stores
        .sort(
          (a, b) => STORE_ORDER.indexOf(a.name) - STORE_ORDER.indexOf(b.name),
        )
        .map((s) => {
          const gasFromPurchases = gasValorByStore.get(s.id) ?? 0;
          const gasFromAp = gasApByStore.get(s.id) ?? 0;
          return {
            storeId: s.id,
            storeName: s.name,
            faturamento: revenueByStore.get(s.id) ?? 0,
            aguaValor: aguaByStore.get(s.id) ?? 0,
            luzValor: luzByStore.get(s.id) ?? 0,
            // Prefere valor calculado a partir das compras de botijão; se não houver, usa lançamento financeiro.
            gasValor: gasFromPurchases > 0 ? gasFromPurchases : gasFromAp,
            gasBotijoes: gasBtjByStore.get(s.id) ?? 0,
            oleoTrocas: oleoByStore.get(s.id) ?? 0,
          };
        });

      setRows(out);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar consumo das lojas");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        faturamento: acc.faturamento + r.faturamento,
        aguaValor: acc.aguaValor + r.aguaValor,
        luzValor: acc.luzValor + r.luzValor,
        gasValor: acc.gasValor + r.gasValor,
        gasBotijoes: acc.gasBotijoes + r.gasBotijoes,
        oleoTrocas: acc.oleoTrocas + r.oleoTrocas,
      }),
      {
        faturamento: 0,
        aguaValor: 0,
        luzValor: 0,
        gasValor: 0,
        gasBotijoes: 0,
        oleoTrocas: 0,
      },
    );
  }, [rows]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        loja: r.storeName,
        "Água %": r.faturamento ? +(r.aguaValor / r.faturamento * 100).toFixed(2) : 0,
        "Luz %": r.faturamento ? +(r.luzValor / r.faturamento * 100).toFixed(2) : 0,
        "Gás %": r.faturamento ? +(r.gasValor / r.faturamento * 100).toFixed(2) : 0,
      })),
    [rows],
  );

  function exportCsv() {
    const header = [
      "Loja",
      "Faturamento (R$)",
      "Água (R$)",
      "Água (% fat.)",
      "Luz (R$)",
      "Luz (% fat.)",
      "Gás (R$)",
      "Gás (botijões)",
      "Gás (% fat.)",
      "Óleo (nº trocas)",
    ];
    const body = rows.map((r) => [
      r.storeName,
      r.faturamento.toFixed(2),
      r.aguaValor.toFixed(2),
      r.faturamento ? ((r.aguaValor / r.faturamento) * 100).toFixed(2) : "",
      r.luzValor.toFixed(2),
      r.faturamento ? ((r.luzValor / r.faturamento) * 100).toFixed(2) : "",
      r.gasValor.toFixed(2),
      r.gasBotijoes,
      r.faturamento ? ((r.gasValor / r.faturamento) * 100).toFixed(2) : "",
      r.oleoTrocas,
    ]);
    const csv = [header, ...body]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consumo-lojas-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const months = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Gauge className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Consumo x Faturamento
        </h1>
        <p className="text-muted-foreground">
          Compare consumo de água, luz, gás e trocas de óleo com o faturamento de cada loja.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base">Período</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tabs value={mode} onValueChange={(v) => setMode(v as "brl" | "pct")}>
                <TabsList>
                  <TabsTrigger value="brl">R$</TabsTrigger>
                  <TabsTrigger value="pct">% do faturamento</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || rows.length === 0}>
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">Água</TableHead>
                    <TableHead className="text-right">Luz</TableHead>
                    <TableHead className="text-right">Gás</TableHead>
                    <TableHead className="text-right">Botijões</TableHead>
                    <TableHead className="text-right">Trocas de óleo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.storeId}>
                      <TableCell className="font-medium">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: STORE_COLOR[r.storeName] }}
                        />
                        {r.storeName}
                      </TableCell>
                      <TableCell className="text-right">{brl(r.faturamento)}</TableCell>
                      <TableCell className="text-right">
                        {mode === "brl" ? brl(r.aguaValor) : pct(r.aguaValor, r.faturamento)}
                      </TableCell>
                      <TableCell className="text-right">
                        {mode === "brl" ? brl(r.luzValor) : pct(r.luzValor, r.faturamento)}
                      </TableCell>
                      <TableCell className="text-right">
                        {mode === "brl" ? brl(r.gasValor) : pct(r.gasValor, r.faturamento)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.gasBotijoes > 0 ? (
                          <Badge variant="secondary">{r.gasBotijoes}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.oleoTrocas > 0 ? (
                          <Badge variant="secondary">{r.oleoTrocas}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Sem dados para o período selecionado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {rows.length > 0 && (
                  <tfoot>
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">{brl(totals.faturamento)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {mode === "brl" ? brl(totals.aguaValor) : pct(totals.aguaValor, totals.faturamento)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {mode === "brl" ? brl(totals.luzValor) : pct(totals.luzValor, totals.faturamento)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {mode === "brl" ? brl(totals.gasValor) : pct(totals.gasValor, totals.faturamento)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{totals.gasBotijoes}</TableCell>
                      <TableCell className="text-right font-semibold">{totals.oleoTrocas}</TableCell>
                    </TableRow>
                  </tfoot>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">% do faturamento por insumo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sem dados no período."}
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="loja" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Água %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Luz %" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gás %" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Dados de Água e Luz vêm do Financeiro (contas a pagar). Gás usa o Controle de Vale Gás quando disponível e cai para o lançamento financeiro. Trocas de óleo vêm do NutriControle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
