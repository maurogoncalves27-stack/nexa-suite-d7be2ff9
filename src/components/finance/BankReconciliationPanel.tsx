import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, CheckCircle2, RotateCcw, Sparkles, Search, AlertCircle, Plus, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { type BankAccount } from "./BankAccountsManager";
import OfxImportDialog from "./OfxImportDialog";
import CreateFinanceFromTxDialog from "./CreateFinanceFromTxDialog";
import AllocationEditor, { type AllocationSplit, type StoreLite, validateSplits } from "./AllocationEditor";
import { Split } from "lucide-react";

interface BankTx {
  id: string;
  posted_at: string;
  amount: number;
  trn_type: string | null;
  memo: string | null;
  payee: string | null;
  check_number: string | null;
  bank_account_id: string;
  reconciled_at: string | null;
}

interface Payable {
  id: string;
  amount: number;
  due_date: string | null;
  beneficiary: string | null;
  supplier_name: string | null;
  description: string | null;
  installment_number: number;
  status: string;
}

interface Receivable {
  id: string;
  amount: number;
  due_date: string | null;
  payer_name: string | null;
  description: string | null;
  status: string;
}

type CandidateKind = "payable" | "receivable";
interface Candidate {
  kind: CandidateKind;
  id: string;
  amount: number;
  due_date: string | null;
  party: string | null;
  description: string | null;
  extra: string | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

// Score 0..1 com base em valor (40%) e data (40%) e similaridade textual (20%)
const scoreCandidate = (tx: BankTx, c: Candidate): number => {
  const txAmt = Math.abs(Number(tx.amount));
  const cAmt = Math.abs(Number(c.amount));
  const amtDiff = Math.abs(txAmt - cAmt);
  let amtScore = 0;
  if (amtDiff < 0.01) amtScore = 1;
  else if (txAmt > 0) {
    const rel = amtDiff / txAmt;
    if (rel <= 0.05) amtScore = 0.7;
    else if (rel <= 0.15) amtScore = 0.4;
    else amtScore = 0;
  }

  const txDate = new Date(tx.posted_at + "T00:00:00").getTime();
  const cDate = c.due_date ? new Date(c.due_date + "T00:00:00").getTime() : null;
  let dateScore = 0;
  if (cDate !== null) {
    const days = Math.abs(cDate - txDate) / 86400000;
    if (days <= 1) dateScore = 1;
    else if (days <= 3) dateScore = 0.8;
    else if (days <= 7) dateScore = 0.5;
    else if (days <= 15) dateScore = 0.2;
  }

  const txTxt = `${tx.payee ?? ""} ${tx.memo ?? ""}`.toLowerCase();
  const cTxt = `${c.party ?? ""} ${c.description ?? ""}`.toLowerCase();
  let textScore = 0;
  if (txTxt && cTxt) {
    const tokens = cTxt.split(/\W+/).filter((t) => t.length >= 4);
    const hits = tokens.filter((t) => txTxt.includes(t)).length;
    if (tokens.length > 0) textScore = Math.min(1, hits / Math.min(tokens.length, 3));
  }

  return amtScore * 0.4 + dateScore * 0.4 + textScore * 0.2;
};

export default function BankReconciliationPanel() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState<BankTx | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [createTarget, setCreateTarget] = useState<BankTx | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReconciled, setShowReconciled] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [hasMore, setHasMore] = useState(false);
  // Lembra a data da última transação conciliada para restaurar a posição
  // após o reload (evita "voltar para o topo" descrito pelo usuário).
  const focusDateRef = useRef<string | null>(null);
  // Rateio (centro de custo = loja)
  const [allocStores, setAllocStores] = useState<StoreLite[]>([]);
  const [allocTarget, setAllocTarget] = useState<BankTx | null>(null);
  const [allocSplits, setAllocSplits] = useState<AllocationSplit[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase.from("bank_accounts").select("*").order("name");
    const list = (data ?? []) as BankAccount[];
    setAccounts(list);
    if (!selectedAccount && list.length > 0) {
      setSelectedAccount(list.find((a) => a.is_active)?.id ?? list[0].id);
    }
  }, [selectedAccount]);

  const loadData = useCallback(async () => {
    if (!selectedAccount) {
      setTransactions([]);
      setPayables([]);
      setReceivables([]);
      return;
    }
    setLoading(true);
    let txQuery = supabase
      .from("bank_transactions")
      .select("id, posted_at, amount, trn_type, memo, payee, check_number, bank_account_id, reconciled_at")
      .eq("bank_account_id", selectedAccount)
      .order("posted_at", { ascending: false })
      .limit(pageSize + 1);
    // Filtra conciliadas direto no servidor quando o usuário não quer vê-las
    if (!showReconciled) {
      txQuery = txQuery.is("reconciled_at", null);
    }

    const payQuery = supabase
      .from("accounts_payable")
      .select("id, amount, due_date, beneficiary, supplier_name, description, installment_number, status")
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .limit(500);

    const recQuery = supabase
      .from("accounts_receivable")
      .select("id, amount, due_date, payer_name, description, status")
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .limit(500);

    const [txRes, payRes, recRes] = await Promise.all([txQuery, payQuery, recQuery]);
    if (txRes.error) toast({ title: "Erro transações", description: txRes.error.message, variant: "destructive" });
    if (payRes.error) toast({ title: "Erro contas a pagar", description: payRes.error.message, variant: "destructive" });
    if (recRes.error) toast({ title: "Erro contas a receber", description: recRes.error.message, variant: "destructive" });
    const txs = (txRes.data ?? []) as BankTx[];
    setHasMore(txs.length > pageSize);
    setTransactions(txs.slice(0, pageSize));
    setPayables((payRes.data ?? []) as Payable[]);
    setReceivables((recRes.data ?? []) as Receivable[]);
    setLoading(false);
  }, [selectedAccount, showReconciled, pageSize]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadData(); }, [loadData]);

  // Carrega lista de lojas para o editor de rateio (uma vez)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, store_type, is_virtual")
        .eq("is_virtual", false)
        .neq("store_type", "central")
        .order("name");
      setAllocStores(((data ?? []) as any[]).map((s) => ({ id: s.id, name: s.name })));
    })();
  }, []);

  // Após conciliar contra um AP/AR já rateado, herda o rateio para a bank_tx
  const inheritAllocationsFromSource = async (txId: string, sourceKind: "payable" | "receivable", sourceId: string, txAbsAmount: number) => {
    const { data: src } = await supabase
      .from("finance_allocations")
      .select("store_id, percent, amount")
      .eq("source_kind", sourceKind)
      .eq("source_id", sourceId);
    if (!src || src.length === 0) return;
    // Remove qualquer rateio antigo da bank_tx e replica proporcional ao valor da tx
    await supabase.from("finance_allocations").delete().eq("source_kind", "bank_tx").eq("source_id", txId);
    let allocated = 0;
    const rows = src.map((s: any, i: number) => {
      const pct = Number(s.percent) || 0;
      const amt = i === src.length - 1
        ? Math.round((txAbsAmount - allocated) * 100) / 100
        : Math.round((pct / 100) * txAbsAmount * 100) / 100;
      allocated += amt;
      return { source_kind: "bank_tx", source_id: txId, store_id: s.store_id, amount: amt, percent: pct };
    });
    await supabase.from("finance_allocations").insert(rows);
  };

  const openAllocDialog = async (tx: BankTx) => {
    setAllocTarget(tx);
    setAllocLoading(true);
    const { data } = await supabase
      .from("finance_allocations")
      .select("store_id, amount, percent")
      .eq("source_kind", "bank_tx")
      .eq("source_id", tx.id);
    const existing = (data ?? []) as any[];
    if (existing.length > 0) {
      setAllocSplits(existing.map((r) => ({
        store_id: r.store_id,
        amount: Number(r.amount),
        percent: Number(r.percent ?? (Number(r.amount) / Math.abs(Number(tx.amount))) * 100),
      })));
    } else {
      setAllocSplits([{ store_id: "", amount: Math.abs(Number(tx.amount)), percent: 100 }]);
    }
    setAllocLoading(false);
  };

  const saveAllocations = async () => {
    if (!allocTarget) return;
    const total = Math.abs(Number(allocTarget.amount));
    const valid = validateSplits(allocSplits, total);
    if (!valid) {
      toast({ title: "Rateio inválido", description: "Confira lojas e a soma dos percentuais.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    // Substitui o rateio antigo
    await supabase.from("finance_allocations").delete().eq("source_kind", "bank_tx").eq("source_id", allocTarget.id);
    if (valid.length > 0) {
      const rows = valid.map((s) => ({
        source_kind: "bank_tx",
        source_id: allocTarget.id,
        store_id: s.store_id,
        amount: s.amount,
        percent: s.percent,
      }));
      const { error } = await supabase.from("finance_allocations").insert(rows);
      if (error) {
        setSubmitting(false);
        toast({ title: "Erro ao salvar rateio", description: error.message, variant: "destructive" });
        return;
      }
    }
    setSubmitting(false);
    toast({ title: "Rateio salvo" });
    setAllocTarget(null);
    setAllocSplits([]);
  };



  // Após cada reload, se houver uma "data foco" salva, rola até a primeira
  // linha cuja posted_at seja <= data foco (mantém o usuário no dia em que
  // ele estava conciliando, em vez de jogá-lo de volta ao topo).
  useEffect(() => {
    if (loading) return;
    const focus = focusDateRef.current;
    if (!focus) return;
    focusDateRef.current = null;
    // Aguarda um frame para garantir que a tabela já foi pintada
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLElement>("tr[data-posted-at]");
      let target: HTMLElement | null = null;
      for (const row of Array.from(rows)) {
        const d = row.dataset.postedAt;
        if (d && d <= focus) { target = row; break; }
      }
      if (!target && rows.length > 0) target = rows[rows.length - 1];
      target?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }, [loading, transactions]);

  // Constrói candidatos compatíveis com cada transação (débito → pagar; crédito → receber)
  // Pré-filtra por janela de valor (±20%) e data (±15 dias) para reduzir O(N×M) drasticamente
  const candidatesFor = useCallback((tx: BankTx, wide = false): Candidate[] => {
    const isCredit = Number(tx.amount) > 0;
    const txAbs = Math.abs(Number(tx.amount));
    const txTime = new Date(tx.posted_at + "T00:00:00").getTime();
    const MAX_DAYS = wide ? 60 : 15;
    const REL_TOL = 0.2;

    const inWindow = (amount: number, due: string | null) => {
      if (!wide) {
        const a = Math.abs(Number(amount));
        if (txAbs > 0 && Math.abs(a - txAbs) / txAbs > REL_TOL) return false;
      } else {
        // No modo lote, qualquer parcial menor ou igual à transação faz sentido
        const a = Math.abs(Number(amount));
        if (txAbs > 0 && a > txAbs + 0.02) return false;
      }
      if (due) {
        const d = new Date(due + "T00:00:00").getTime();
        if (Math.abs(d - txTime) / 86400000 > MAX_DAYS) return false;
      }
      return true;
    };

    if (isCredit) {
      return receivables
        .filter((r) => inWindow(r.amount, r.due_date))
        .map<Candidate>((r) => ({
          kind: "receivable",
          id: r.id,
          amount: r.amount,
          due_date: r.due_date,
          party: r.payer_name,
          description: r.description,
          extra: null,
        }));
    }
    return payables
      .filter((p) => inWindow(p.amount, p.due_date))
      .map<Candidate>((p) => ({
        kind: "payable",
        id: p.id,
        amount: p.amount,
        due_date: p.due_date,
        party: p.beneficiary || p.supplier_name,
        description: p.description,
        extra: `Parc. ${p.installment_number}`,
      }));
  }, [payables, receivables]);

  // Sugestão automática (top score >= 0.7)
  const suggestionMap = useMemo(() => {
    const map = new Map<string, Candidate | null>();
    for (const tx of transactions) {
      if (tx.reconciled_at) continue;
      const cands = candidatesFor(tx);
      let best: { c: Candidate; s: number } | null = null;
      for (const c of cands) {
        const s = scoreCandidate(tx, c);
        if (s < 0.7) continue;
        if (!best || s > best.s) best = { c, s };
      }
      map.set(tx.id, best?.c ?? null);
    }
    return map;
  }, [transactions, candidatesFor]);

  const filteredTx = transactions.filter((t) => {
    if (!showReconciled && t.reconciled_at) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.memo ?? "").toLowerCase().includes(s)
      || (t.payee ?? "").toLowerCase().includes(s)
      || String(t.amount).includes(s);
  });

  const reconcileCandidate = async (txId: string, c: Candidate) => {
    setSubmitting(true);
    const fn = c.kind === "payable" ? "reconcile_bank_transaction" : "reconcile_bank_transaction_receivable";
    const params: any = c.kind === "payable"
      ? { _transaction_id: txId, _payable_id: c.id }
      : { _transaction_id: txId, _receivable_id: c.id };
    const { error } = await supabase.rpc(fn as any, params);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao conciliar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conciliada", description: c.kind === "payable" ? "Conta a pagar quitada." : "Conta a receber recebida." });
    const tx = transactions.find((t) => t.id === txId);
    if (tx) {
      focusDateRef.current = tx.posted_at;
      // Herda o rateio do AP/AR (se houver) para a transação bancária
      await inheritAllocationsFromSource(txId, c.kind, c.id, Math.abs(Number(tx.amount)));
    }
    setMatchTarget(null);
    setMatchSearch("");
    await loadData();
  };

  const reconcileBatch = async () => {
    if (!matchTarget) return;
    if (batchSelected.size === 0) {
      toast({ title: "Selecione ao menos uma conta", variant: "destructive" });
      return;
    }
    const isCredit = Number(matchTarget.amount) > 0;
    const ids = Array.from(batchSelected);
    setSubmitting(true);
    const params: any = isCredit
      ? { _transaction_id: matchTarget.id, _receivable_ids: ids, _payable_ids: [] }
      : { _transaction_id: matchTarget.id, _payable_ids: ids, _receivable_ids: [] };
    const { error } = await supabase.rpc("reconcile_bank_transaction_batch" as any, params);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao conciliar lote", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conciliada", description: `${ids.length} ${isCredit ? "recebimentos" : "pagamentos"} vinculados.` });
    focusDateRef.current = matchTarget.posted_at;
    setMatchTarget(null);
    setMatchSearch("");
    setBatchMode(false);
    setBatchSelected(new Set());
    await loadData();
  };

  const undo = async (txId: string) => {
    setSubmitting(true);
    const { error } = await supabase.rpc("unreconcile_bank_transaction", { _transaction_id: txId });
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conciliação desfeita" });
    const tx = transactions.find((t) => t.id === txId);
    if (tx) focusDateRef.current = tx.posted_at;
    await loadData();
  };


  const autoReconcileAll = async () => {
    const candidates = transactions
      .filter((t) => !t.reconciled_at && suggestionMap.get(t.id))
      .map((t) => ({ tx: t, sug: suggestionMap.get(t.id)! }));
    if (candidates.length === 0) {
      toast({ title: "Nada para conciliar", description: "Nenhuma sugestão automática encontrada." });
      return;
    }
    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (const { tx, sug } of candidates) {
      const fn = sug.kind === "payable" ? "reconcile_bank_transaction" : "reconcile_bank_transaction_receivable";
      const params: any = sug.kind === "payable"
        ? { _transaction_id: tx.id, _payable_id: sug.id }
        : { _transaction_id: tx.id, _receivable_id: sug.id };
      const { error } = await supabase.rpc(fn as any, params);
      if (error) fail++;
      else ok++;
    }
    setSubmitting(false);
    toast({
      title: "Conciliação automática concluída",
      description: `${ok} aplicadas${fail > 0 ? `, ${fail} falharam` : ""}.`,
    });
    await loadData();
  };

  const suggestionsCount = useMemo(
    () => transactions.filter((t) => !t.reconciled_at && suggestionMap.get(t.id)).length,
    [transactions, suggestionMap],
  );

  // Ranking para o diálogo manual
  const rankedForMatch = useMemo(() => {
    if (!matchTarget) return [] as Array<Candidate & { score: number }>;
    const cands = candidatesFor(matchTarget, batchMode);
    const list = cands
      .map((c) => ({ ...c, score: scoreCandidate(matchTarget, c) }))
      .filter((c) => {
        if (!matchSearch) return true;
        const s = matchSearch.toLowerCase();
        return (c.party ?? "").toLowerCase().includes(s)
          || (c.description ?? "").toLowerCase().includes(s)
          || String(c.amount).includes(s);
      })
      .sort((a, b) => b.score - a.score);
    return list;
  }, [matchTarget, candidatesFor, matchSearch, batchMode]);

  const matchTargetIsCredit = matchTarget ? Number(matchTarget.amount) > 0 : false;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Conta bancária</label>
                <select
                  className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  {accounts.length === 0 && <option value="">Cadastre uma conta primeiro</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPageSize(50); setShowReconciled((v) => !v); }}>
                {showReconciled ? "Ocultar conciliadas" : "Mostrar conciliadas"}
              </Button>
              {suggestionsCount > 0 && (
                <Button size="sm" variant="secondary" disabled={submitting} onClick={autoReconcileAll} className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Aplicar {suggestionsCount} sugest{suggestionsCount === 1 ? "ão" : "ões"}
                </Button>
              )}
              <Button size="sm" disabled={accounts.length === 0} onClick={() => setImportOpen(true)} className="gap-1">
                <Upload className="h-3.5 w-3.5" /> Importar OFX
              </Button>
            </div>
          </div>

          {accounts.length === 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
              <div>
                Cadastre ao menos uma conta bancária na aba <strong>Contas bancárias</strong> antes de importar extratos.
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredTx.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {transactions.length === 0
                ? "Nenhuma transação importada ainda. Clique em \"Importar OFX\"."
                : "Nenhuma transação corresponde ao filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Sugestão</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTx.map((tx) => {
                    const sug = suggestionMap.get(tx.id);
                    const isReconciled = !!tx.reconciled_at;
                    return (
                      <TableRow key={tx.id} data-posted-at={tx.posted_at} className={isReconciled ? "opacity-60" : undefined}>
                        <TableCell className="whitespace-nowrap">{fmtDate(tx.posted_at)}</TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="truncate text-sm">{tx.payee || tx.memo || "—"}</div>
                          {tx.payee && tx.memo && <div className="truncate text-xs text-muted-foreground">{tx.memo}</div>}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">{fmtBRL(Number(tx.amount))}</TableCell>
                        <TableCell>
                          {isReconciled ? (
                            <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Conciliada</Badge>
                          ) : sug ? (
                            <div className="text-xs">
                              <div className="font-medium flex items-center gap-1">
                                {sug.kind === "payable" ? <ArrowUpCircle className="h-3 w-3 text-destructive" /> : <ArrowDownCircle className="h-3 w-3 text-success" />}
                                {sug.party || sug.description || "—"}
                              </div>
                              <div className="text-muted-foreground">Vence {fmtDate(sug.due_date)} • {fmtBRL(Number(sug.amount))}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem sugestão</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap items-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ratear entre lojas"
                              className="h-8 w-8"
                              onClick={() => openAllocDialog(tx)}
                            >
                              <Split className="h-3.5 w-3.5" />
                            </Button>
                            {isReconciled ? (
                              <Button size="sm" variant="ghost" disabled={submitting} onClick={() => undo(tx.id)} className="gap-1">
                                <RotateCcw className="h-3 w-3" /> Desfazer
                              </Button>
                            ) : sug ? (
                              <>
                                <Button size="sm" disabled={submitting} onClick={() => reconcileCandidate(tx.id, sug)} className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Aceitar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setMatchSearch(""); setMatchTarget(tx); }}>Outra</Button>
                                <Button size="sm" variant="ghost" onClick={() => setCreateTarget(tx)} className="gap-1">
                                  <Plus className="h-3 w-3" /> Gerar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setMatchSearch(""); setMatchTarget(tx); }}>Vincular</Button>
                                <Button size="sm" onClick={() => setCreateTarget(tx)} className="gap-1">
                                  <Plus className="h-3 w-3" /> Gerar lançamento
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasMore && (
                <div className="flex justify-center pt-3">
                  <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + 50)}>
                    Carregar mais 50
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <OfxImportDialog
        accounts={accounts}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={loadData}
      />

      {/* Match manual com ranking de compatibilidade — suporta lote */}
      <Dialog open={!!matchTarget} onOpenChange={(o) => {
        if (submitting) return;
        if (!o) {
          setMatchTarget(null);
          setBatchMode(false);
          setBatchSelected(new Set());
          setMatchSearch("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Vincular a {matchTargetIsCredit ? "conta(s) a receber" : "conta(s) a pagar"}
            </DialogTitle>
            <DialogDescription>
              Transação de <strong>{matchTarget && fmtBRL(Number(matchTarget.amount))}</strong> em {matchTarget && fmtDate(matchTarget.posted_at)} — {matchTarget?.payee || matchTarget?.memo}
              <br />
              {batchMode
                ? "Selecione várias contas — a soma precisa bater com o valor da transação (tolerância de R$ 0,02)."
                : "Sugestões abaixo ordenadas por compatibilidade. Use o modo lote para vincular várias contas a esta movimentação."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome, descrição ou valor..."
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              size="sm"
              variant={batchMode ? "default" : "outline"}
              onClick={() => {
                setBatchMode((v) => !v);
                setBatchSelected(new Set());
              }}
            >
              {batchMode ? "Sair do lote" : "Lote (vários)"}
            </Button>
          </div>

          {batchMode && matchTarget && (() => {
            const txAbs = Math.abs(Number(matchTarget.amount));
            const sumSel = rankedForMatch
              .filter((c) => batchSelected.has(c.id))
              .reduce((acc, c) => acc + Number(c.amount), 0);
            const diff = txAbs - sumSel;
            const ok = Math.abs(diff) <= 0.02 && batchSelected.size > 0;
            return (
              <div className={`rounded-md border p-2 text-xs flex items-center justify-between ${
                ok ? "bg-success/10 border-success/30 text-success" :
                batchSelected.size > 0 ? "bg-amber-500/10 border-amber-500/30 text-amber-800" :
                "bg-muted/50 border-border text-muted-foreground"
              }`}>
                <span>{batchSelected.size} selecionada(s) — soma {fmtBRL(sumSel)}</span>
                <span>
                  {batchSelected.size === 0
                    ? `Falta ${fmtBRL(txAbs)}`
                    : ok
                      ? "✓ Bate com a transação"
                      : `Diferença ${fmtBRL(diff)}`}
                </span>
              </div>
            );
          })()}

          <div className="max-h-[460px] overflow-y-auto border rounded-md divide-y">
            {rankedForMatch.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                {matchTargetIsCredit ? "Nenhuma conta a receber em aberto." : "Nenhuma conta a pagar em aberto."}
              </p>
            ) : rankedForMatch.map((c) => {
              const matchPct = Math.round(c.score * 100);
              const matchTone =
                c.score >= 0.7 ? "bg-success/15 text-success border-success/30"
                : c.score >= 0.4 ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
                : "bg-muted text-muted-foreground";
              const checked = batchSelected.has(c.id);
              const onClick = () => {
                if (!matchTarget) return;
                if (batchMode) {
                  setBatchSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  });
                } else {
                  reconcileCandidate(matchTarget.id, c);
                }
              };
              return (
                <button
                  key={`${c.kind}-${c.id}`}
                  disabled={submitting}
                  onClick={onClick}
                  className={`w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-3 disabled:opacity-50 ${
                    batchMode && checked ? "bg-primary/5" : ""
                  }`}
                >
                  {batchMode && (
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-4 w-4 accent-primary shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-1">
                      {c.kind === "payable"
                        ? <ArrowUpCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        : <ArrowDownCircle className="h-3.5 w-3.5 text-success shrink-0" />}
                      <span className="truncate">{c.party || c.description || "Sem identificação"}</span>
                      {c.extra && <span className="text-xs text-muted-foreground ml-1">• {c.extra}</span>}
                    </div>
                    {c.description && c.party && (
                      <div className="text-xs text-muted-foreground truncate">{c.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground">Vence {fmtDate(c.due_date)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium whitespace-nowrap">{fmtBRL(Number(c.amount))}</div>
                    {!batchMode && (
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] ${matchTone}`}>
                        {matchPct}% match
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMatchTarget(null)} disabled={submitting}>Cancelar</Button>
            {batchMode && (
              <Button onClick={reconcileBatch} disabled={submitting || batchSelected.size === 0}>
                Conciliar {batchSelected.size > 0 ? `(${batchSelected.size})` : "lote"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateFinanceFromTxDialog
        tx={createTarget}
        onOpenChange={(o) => !o && setCreateTarget(null)}
        onCreated={loadData}
      />

      <Dialog open={!!allocTarget} onOpenChange={(o) => { if (!o && !submitting) { setAllocTarget(null); setAllocSplits([]); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ratear entre lojas</DialogTitle>
            <DialogDescription>
              {allocTarget && (
                <>Transação de <strong>{fmtBRL(Number(allocTarget.amount))}</strong> em {fmtDate(allocTarget.posted_at)} — {allocTarget.payee || allocTarget.memo || "—"}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {allocLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <AllocationEditor
              stores={allocStores}
              totalAmount={allocTarget ? Math.abs(Number(allocTarget.amount)) : 0}
              value={allocSplits}
              onChange={setAllocSplits}
              disabled={submitting}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAllocTarget(null); setAllocSplits([]); }} disabled={submitting}>Cancelar</Button>
            <Button onClick={saveAllocations} disabled={submitting || allocLoading}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar rateio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
