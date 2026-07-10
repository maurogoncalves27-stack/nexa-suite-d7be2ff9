import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, ArrowDownCircle, ArrowUpCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface BankAccount {
  id: string;
  name: string;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  initial_balance: number;
}

interface BankTx {
  id: string;
  amount: number;
  posted_at: string;
  payee: string | null;
  memo: string | null;
  trn_type: string | null;
  notes: string | null;
  reconciled_at: string | null;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export default function FinanceAccountStatement() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = usePersistentState<string>("finance:statement:accountId", "");
  const [from, setFrom] = usePersistentState<string>(
    "finance:statement:from",
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [to, setTo] = usePersistentState<string>(
    "finance:statement:to",
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  useScrollRestoration("finance:statement", !loading);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, bank_name, agency, account_number, initial_balance")
        .eq("is_active", true)
        .order("name");
      if (error) {
        toast({ title: "Erro ao carregar contas", description: error.message, variant: "destructive" });
        return;
      }
      setAccounts((data ?? []) as BankAccount[]);
      if (data && data.length && !accountId) setAccountId(data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!accountId) return;
    void load();
  }, [accountId, from, to]);

  async function load() {
    setLoading(true);
    try {
      // Saldo inicial = initial_balance + soma dos movimentos antes de "from"
      const acc = accounts.find((a) => a.id === accountId);
      const base = acc?.initial_balance ?? 0;
      const prev = await supabase
        .from("bank_transactions")
        .select("amount")
        .eq("bank_account_id", accountId)
        .lt("posted_at", from);
      const prevSum = (prev.data ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
      setOpeningBalance(base + prevSum);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, amount, posted_at, payee, memo, trn_type, notes, reconciled_at")
        .eq("bank_account_id", accountId)
        .gte("posted_at", from)
        .lte("posted_at", to)
        .order("posted_at", { ascending: true });
      if (error) throw error;
      setTxs((data ?? []) as BankTx[]);
    } catch (e: any) {
      toast({ title: "Erro ao carregar extrato", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const credits = txs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    const debits = txs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0);
    const closing = openingBalance + credits + debits;
    return { credits, debits, closing };
  }, [txs, openingBalance]);

  const rowsWithBalance = useMemo(() => {
    let bal = openingBalance;
    return txs.map((t) => {
      bal += Number(t.amount);
      return { ...t, runningBalance: bal };
    });
  }, [txs, openingBalance]);

  function exportCsv() {
    const header = ["Data", "Histórico", "Tipo", "Valor", "Saldo", "Conciliado"];
    const lines = rowsWithBalance.map((r) =>
      [
        format(parseLocalDate(r.posted_at), "dd/MM/yyyy"),
        (r.payee || r.memo || "").replace(/;/g, ","),
        r.trn_type ?? "",
        Number(r.amount).toFixed(2).replace(".", ","),
        r.runningBalance.toFixed(2).replace(".", ","),
        r.reconciled_at ? "Sim" : "Não",
      ].join(";"),
    );
    const csv = [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const acc = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <Landmark className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          Extrato da conta
        </h1>
        <p className="text-muted-foreground">
          Movimentações de uma conta bancária, com saldo acumulado e exportação em CSV.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} {a.bank_name ? `· ${a.bank_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {acc && (
            <p className="text-xs text-muted-foreground">
              {acc.bank_name ?? "Banco"} · Ag. {acc.agency ?? "-"} · Conta {acc.account_number ?? "-"}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Saldo inicial</p>
          <p className="text-lg font-semibold">{brl(openingBalance)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Créditos</p>
          <p className="text-lg font-semibold text-success">{brl(totals.credits)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Débitos</p>
          <p className="text-lg font-semibold text-destructive">{brl(totals.debits)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Saldo final</p>
          <p className="text-lg font-semibold">{brl(totals.closing)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Lançamentos ({rowsWithBalance.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rowsWithBalance.length}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : rowsWithBalance.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum lançamento no período.
            </p>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Histórico</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsWithBalance.map((r) => {
                      const credit = Number(r.amount) >= 0;
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {format(parseLocalDate(r.posted_at), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {credit
                                ? <ArrowDownCircle className="h-4 w-4 text-success shrink-0" />
                                : <ArrowUpCircle className="h-4 w-4 text-destructive shrink-0" />}
                              <span className="truncate">{r.payee || r.memo || "(sem descrição)"}</span>
                            </div>
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${credit ? "text-success" : "text-destructive"}`}>
                            {brl(Number(r.amount))}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {brl(r.runningBalance)}
                          </td>
                          <td className="px-3 py-2">
                            {r.reconciled_at
                              ? <Badge variant="outline" className="text-success border-success/30">Conciliado</Badge>
                              : <Badge variant="outline">Pendente</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {rowsWithBalance.map((r) => {
                  const credit = Number(r.amount) >= 0;
                  return (
                    <div key={r.id} className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {credit
                            ? <ArrowDownCircle className="h-4 w-4 text-success shrink-0" />
                            : <ArrowUpCircle className="h-4 w-4 text-destructive shrink-0" />}
                          <p className="text-sm truncate">{r.payee || r.memo || "(sem descrição)"}</p>
                        </div>
                        <p className={`text-sm font-semibold tabular-nums ${credit ? "text-success" : "text-destructive"}`}>
                          {brl(Number(r.amount))}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{format(parseLocalDate(r.posted_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        <span className="tabular-nums">Saldo: {brl(r.runningBalance)}</span>
                      </div>
                      {r.reconciled_at && (
                        <Badge variant="outline" className="text-success border-success/30 text-[10px]">
                          Conciliado
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
