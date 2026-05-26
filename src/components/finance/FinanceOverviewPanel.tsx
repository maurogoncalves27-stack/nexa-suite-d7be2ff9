import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Wallet, AlertTriangle } from "lucide-react";

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Metrics {
  payableOpen: number;
  payableOverdue: number;
  receivableOpen: number;
  receivableOverdue: number;
  paid30: number;
  received30: number;
  upcomingWeek: { description: string; amount: number; due_date: string; type: "out" | "in" }[];
}

export default function FinanceOverviewPanel() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayIso = today.toISOString().slice(0,10);
      const weekIso = new Date(today.getTime() + 7*86400000).toISOString().slice(0,10);
      const past30 = new Date(today.getTime() - 30*86400000).toISOString().slice(0,10);

      const [pAll, rAll, pPaid, rRecv, pUpcoming, rUpcoming] = await Promise.all([
        supabase.from("accounts_payable").select("amount, due_date").eq("status", "open"),
        supabase.from("accounts_receivable").select("amount, due_date").eq("status", "open"),
        supabase.from("accounts_payable").select("amount").eq("status", "paid").gte("paid_at", past30),
        supabase.from("accounts_receivable").select("amount").eq("status", "received").gte("received_at", past30),
        supabase.from("accounts_payable").select("description, beneficiary, supplier_name, amount, due_date")
          .eq("status", "open").gte("due_date", todayIso).lte("due_date", weekIso).order("due_date").limit(5),
        supabase.from("accounts_receivable").select("description, amount, due_date")
          .eq("status", "open").gte("due_date", todayIso).lte("due_date", weekIso).order("due_date").limit(5),
      ]);

      const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const overdue = (rows: { amount: number; due_date: string | null }[] | null) =>
        (rows ?? []).filter((r) => r.due_date && r.due_date < todayIso).reduce((s, r) => s + Number(r.amount), 0);

      const upcoming: Metrics["upcomingWeek"] = [
        ...((pUpcoming.data ?? []) as any[]).map((p) => ({
          description: p.description || p.supplier_name || p.beneficiary || "Conta a pagar",
          amount: Number(p.amount), due_date: p.due_date, type: "out" as const,
        })),
        ...((rUpcoming.data ?? []) as any[]).map((r) => ({
          description: r.description || "Conta a receber",
          amount: Number(r.amount), due_date: r.due_date, type: "in" as const,
        })),
      ].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8);

      setM({
        payableOpen: sum(pAll.data),
        payableOverdue: overdue(pAll.data ?? []),
        receivableOpen: sum(rAll.data),
        receivableOverdue: overdue(rAll.data ?? []),
        paid30: sum(pPaid.data),
        received30: sum(rRecv.data),
        upcomingWeek: upcoming,
      });
      setLoading(false);
    })();
  }, []);

  if (loading || !m) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const balance30 = m.received30 - m.paid30;
  const projection = m.receivableOpen - m.payableOpen;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">A pagar (aberto)</div>
              <div className="text-xl font-bold text-rose-600">{fmtBRL(m.payableOpen)}</div>
              {m.payableOverdue > 0 && (
                <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" /> {fmtBRL(m.payableOverdue)} vencidas
                </div>
              )}
            </div>
            <TrendingDown className="h-5 w-5 text-rose-600" />
          </div>
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">A receber (aberto)</div>
              <div className="text-xl font-bold text-emerald-600">{fmtBRL(m.receivableOpen)}</div>
              {m.receivableOverdue > 0 && (
                <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" /> {fmtBRL(m.receivableOverdue)} vencidas
                </div>
              )}
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Saldo últimos 30 dias</div>
              <div className={`text-xl font-bold ${balance30 >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {fmtBRL(balance30)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                + {fmtBRL(m.received30)} / − {fmtBRL(m.paid30)}
              </div>
            </div>
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Projeção (líquido em aberto)</div>
              <div className={`text-xl font-bold ${projection >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {fmtBRL(projection)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">A receber − a pagar</div>
            </div>
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <h3 className="font-semibold">Próximos 7 dias</h3>
          {m.upcomingWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum vencimento na próxima semana.</p>
          ) : (
            <div className="space-y-1">
              {m.upcomingWeek.map((it, i) => (
                <div key={i} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {it.type === "out"
                      ? <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
                      : <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />}
                    <div>
                      <div className="truncate max-w-[400px]">{it.description}</div>
                      <div className="text-xs text-muted-foreground">{new Date(it.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                    </div>
                  </div>
                  <div className={`font-medium ${it.type === "out" ? "text-rose-600" : "text-emerald-600"}`}>
                    {fmtBRL(it.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
