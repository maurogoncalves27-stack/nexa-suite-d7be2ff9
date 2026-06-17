import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Loader2,
  Search,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Landmark,
  Undo2,
  Pencil,
  Trash2,
  ShoppingBasket,
  CalendarDays,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import EditStatementRowDialog, { type EditableKind } from "./EditStatementRowDialog";
import * as XLSX from "xlsx";

type DateField = "due" | "competence" | "paid";
type ViewTab = "lancamentos" | "corrente";

type Kind = "payable" | "receivable" | "transfer" | "bank";

interface StatementRow {
  id: string;
  kind: Kind;
  competence_date: string | null; // NF issue_date
  due_date: string | null;
  paid_date: string | null; // bank movement / settlement date
  sort_date: string; // for ordering
  description: string;
  party: string | null;
  category: string | null;
  store: string | null;
  amount: number;
  status: string;
  raw: any;
}

interface Props {
  onNewPayable?: () => void;
  onNewReceivable?: () => void;
  onNewTransfer?: () => void;
}

const fmtBRL = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function statusBadge(row: StatementRow) {
  if (row.kind === "bank") {
    if (row.status === "reconciled") {
      return (
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Conciliada
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Landmark className="h-3 w-3" /> Banco
      </Badge>
    );
  }
  const settled =
    row.status === "paid" || row.status === "received" || row.kind === "transfer";
  if (settled) {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-500 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {row.kind === "transfer" ? "Concluída" : row.kind === "payable" ? "Pago" : "Recebido"}
      </Badge>
    );
  }
  if (row.status === "cancelled") return <Badge variant="outline">Cancelado</Badge>;
  if (row.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(row.due_date + "T00:00:00");
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0)
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" /> Vencido
        </Badge>
      );
    if (diff <= 3)
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500 gap-1">
          <Clock className="h-3 w-3" /> {diff}d
        </Badge>
      );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      {row.kind === "payable" ? "A pagar" : "A receber"}
    </Badge>
  );
}

function KindIcon({ kind, amount }: { kind: Kind; amount?: number }) {
  if (kind === "payable")
    return <ArrowUpCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (kind === "receivable")
    return <ArrowDownCircle className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (kind === "bank") {
    if ((amount ?? 0) >= 0)
      return <ArrowDownCircle className="h-4 w-4 text-emerald-600 shrink-0 opacity-70" />;
    return <ArrowUpCircle className="h-4 w-4 text-destructive shrink-0 opacity-70" />;
  }
  return <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export default function FinanceStatementPanel({
  onNewPayable,
  onNewReceivable,
  onNewTransfer,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [viewTab, setViewTab] = useState<ViewTab>("lancamentos");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "settled" | "overdue">("all");
  const [search, setSearch] = useState("");
  const [dateField, setDateField] = useState<DateField>("due");
  const todayIso = new Date().toISOString().slice(0, 7);
  const [monthCursor, setMonthCursor] = useState<string>(todayIso); // YYYY-MM
  const [monthOpen, setMonthOpen] = useState(false);
  const [editing, setEditing] = useState<{ kind: EditableKind; raw: any } | null>(null);

  const monthRange = useMemo(() => {
    const [y, m] = monthCursor.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: iso(start), to: iso(end) };
  }, [monthCursor]);

  const monthLabelText = useMemo(() => {
    const [y, m] = monthCursor.split("-").map(Number);
    const txt = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }, [monthCursor]);

  const shiftMonth = (delta: number) => {
    const [y, m] = monthCursor.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const load = async () => {
    setLoading(true);
    // Janela do mês selecionado + folga (3 dias) p/ pegar lançamentos cujo
    // paid_at/competence caia em meses vizinhos. Sem isso, com >500 registros
    // o limit cortava meses inteiros (ex.: maio sumia quando jun+jul+... ≥ 500).
    const { from, to } = monthRange;
    const pad = (s: string, days: number) => {
      const d = new Date(s + "T00:00:00");
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const fromPad = pad(from, -3);
    const toPad = pad(to, 3);
    const toPadNext = pad(to, 4); // exclusivo para timestamps
    const payOr = `and(due_date.gte.${fromPad},due_date.lte.${toPad}),and(paid_at.gte.${fromPad}T00:00:00,paid_at.lt.${toPadNext}T00:00:00),and(competence_date.gte.${fromPad},competence_date.lte.${toPad})`;
    const recOr = `and(due_date.gte.${fromPad},due_date.lte.${toPad}),and(received_at.gte.${fromPad}T00:00:00,received_at.lt.${toPadNext}T00:00:00)`;

    const [pay, rec, tr, bk] = await Promise.all([
      supabase
        .from("accounts_payable")
        .select(
          "id, due_date, paid_at, amount, status, supplier_name, beneficiary, description, store_id, category_id, bank_transaction_id, competence_date, finance_categories(name), stores(name), inventory_invoices(supplier_name, invoice_number, issue_date)",
        )
        .or(payOr)
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(2000),
      supabase
        .from("accounts_receivable")
        .select(
          "id, due_date, received_at, amount, status, payer_name, description, store_id, category_id, bank_transaction_id, finance_categories(name), stores(name)",
        )
        .or(recOr)
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(2000),
      supabase
        .from("bank_transfers")
        .select(
          "id, transferred_at, amount, description, from_transaction_id, to_transaction_id, from_account:bank_accounts!bank_transfers_from_account_id_fkey(name), to_account:bank_accounts!bank_transfers_to_account_id_fkey(name)",
        )
        .gte("transferred_at", fromPad)
        .lte("transferred_at", toPad)
        .order("transferred_at", { ascending: false })
        .limit(500),
      supabase
        .from("bank_transactions")
        .select(
          "id, posted_at, amount, memo, payee, reconciled_at, bank_account_id, bank_accounts(name)",
        )
        .gte("posted_at", fromPad)
        .lte("posted_at", toPad)
        .order("posted_at", { ascending: false })
        .limit(2000),
    ]);

    if (pay.error) toast({ title: "Erro a pagar", description: pay.error.message, variant: "destructive" });
    if (rec.error) toast({ title: "Erro a receber", description: rec.error.message, variant: "destructive" });
    if (tr.error) toast({ title: "Erro transferências", description: tr.error.message, variant: "destructive" });
    if (bk.error) toast({ title: "Erro extrato banco", description: bk.error.message, variant: "destructive" });

    const merged: StatementRow[] = [];
    const linkedTxIds = new Set<string>();

    for (const p of (pay.data ?? []) as any[]) {
      if (p.bank_transaction_id) linkedTxIds.add(p.bank_transaction_id);
      const paidDate = p.paid_at ? String(p.paid_at).slice(0, 10) : null;
      const sort = paidDate || p.due_date || p.inventory_invoices?.issue_date || new Date().toISOString().slice(0, 10);
      const supplier =
        p.inventory_invoices?.supplier_name || p.supplier_name || p.beneficiary || null;
      const competence =
        p.inventory_invoices?.issue_date ?? paidDate ?? p.due_date ?? null;
      merged.push({
        id: `pay-${p.id}`,
        kind: "payable",
        competence_date: competence,
        due_date: p.due_date,
        paid_date: paidDate,
        sort_date: sort,
        description:
          p.description ||
          (p.inventory_invoices?.invoice_number ? `NF ${p.inventory_invoices.invoice_number}` : "Conta a pagar"),
        party: supplier,
        category: p.finance_categories?.name ?? null,
        store: p.stores?.name ?? null,
        amount: -Math.abs(Number(p.amount)),
        status: p.status,
        raw: p,
      });
    }

    for (const r of (rec.data ?? []) as any[]) {
      if (r.bank_transaction_id) linkedTxIds.add(r.bank_transaction_id);
      const recvDate = r.received_at ? String(r.received_at).slice(0, 10) : null;
      const sort = recvDate || r.due_date || new Date().toISOString().slice(0, 10);
      const competence = recvDate ?? r.due_date ?? null;
      merged.push({
        id: `rec-${r.id}`,
        kind: "receivable",
        competence_date: competence,
        due_date: r.due_date,
        paid_date: recvDate,
        sort_date: sort,
        description: r.description || "Conta a receber",
        party: r.payer_name,
        category: r.finance_categories?.name ?? null,
        store: r.stores?.name ?? null,
        amount: Math.abs(Number(r.amount)),
        status: r.status,
        raw: r,
      });
    }

    for (const t of (tr.data ?? []) as any[]) {
      if (t.from_transaction_id) linkedTxIds.add(t.from_transaction_id);
      if (t.to_transaction_id) linkedTxIds.add(t.to_transaction_id);
      const fromName = t.from_account?.name ?? "—";
      const toName = t.to_account?.name ?? "—";
      const dt = String(t.transferred_at).slice(0, 10);
      merged.push({
        id: `tr-${t.id}`,
        kind: "transfer",
        competence_date: null,
        due_date: null,
        paid_date: dt,
        sort_date: dt,
        description: t.description || "Transferência entre contas",
        party: `${fromName} → ${toName}`,
        category: null,
        store: null,
        amount: Number(t.amount),
        status: "done",
        raw: t,
      });
    }

    for (const b of (bk.data ?? []) as any[]) {
      if (linkedTxIds.has(b.id)) continue;
      if (!b.reconciled_at) continue;
      const dt = String(b.posted_at).slice(0, 10);
      merged.push({
        id: `bk-${b.id}`,
        kind: "bank",
        competence_date: null,
        due_date: null,
        paid_date: dt,
        sort_date: dt,
        description: b.payee || b.memo || "Movimentação bancária",
        party: b.bank_accounts?.name ?? null,
        category: null,
        store: null,
        amount: Number(b.amount),
        status: b.reconciled_at ? "reconciled" : "unreconciled",
        raw: b,
      });
    }

    merged.sort((a, b) => (a.sort_date < b.sort_date ? 1 : a.sort_date > b.sort_date ? -1 : 0));
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pickDate = (r: StatementRow): string | null => {
      if (dateField === "due") return r.due_date || r.paid_date || r.competence_date;
      if (dateField === "paid") return r.paid_date || r.due_date;
      return r.competence_date || r.due_date || r.paid_date;
    };
    return rows.filter((r) => {
      if (viewTab === "corrente" && r.kind !== "bank" && r.kind !== "transfer") return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      const d = pickDate(r) ?? r.sort_date;
      if (d < monthRange.from || d > monthRange.to) return false;
      if (statusFilter === "open") {
        if (!(r.status === "open" || r.status === "pending" || r.status === "unreconciled")) return false;
      } else if (statusFilter === "settled") {
        if (
          !(
            r.status === "paid" ||
            r.status === "received" ||
            r.status === "reconciled" ||
            r.kind === "transfer"
          )
        )
          return false;
      } else if (statusFilter === "overdue") {
        if (!(r.status === "open" || r.status === "pending")) return false;
        if (!r.due_date) return false;
        if (new Date(r.due_date + "T00:00:00") >= today) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        const hay =
          (r.description || "").toLowerCase() +
          " " +
          (r.party || "").toLowerCase() +
          " " +
          (r.category || "").toLowerCase() +
          " " +
          (r.store || "").toLowerCase() +
          " " +
          String(Math.abs(r.amount));
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, viewTab, kindFilter, statusFilter, search, dateField, monthRange]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0,
      pendingIn = 0,
      pendingOut = 0,
      paid = 0,
      received = 0,
      overdueOut = 0,
      overdueIn = 0,
      upcomingOut = 0,
      upcomingIn = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const r of filtered) {
      if (r.kind === "transfer") continue;
      const settled =
        r.status === "paid" || r.status === "received" || r.status === "reconciled";
      if (settled) {
        if (r.amount >= 0) {
          income += r.amount;
          received += r.amount;
        } else {
          expense += -r.amount;
          paid += -r.amount;
        }
      } else {
        if (r.amount >= 0) pendingIn += r.amount;
        else pendingOut += -r.amount;
        const isOverdue =
          !!r.due_date && new Date(r.due_date + "T00:00:00") < today;
        if (isOverdue) {
          if (r.amount >= 0) overdueIn += r.amount;
          else overdueOut += -r.amount;
        } else {
          if (r.amount >= 0) upcomingIn += r.amount;
          else upcomingOut += -r.amount;
        }
      }
    }
    return {
      income,
      expense,
      net: income - expense,
      pendingIn,
      pendingOut,
      paid,
      received,
      overdueOut,
      overdueIn,
      upcomingOut,
      upcomingIn,
    };
  }, [filtered]);

  const editableKindOf = (k: Kind): EditableKind => k;

  const [reverting, setReverting] = useState<string | null>(null);

  const handleRevertPayment = async (row: StatementRow) => {
    const isSettled =
      (row.kind === "payable" && row.status === "paid") ||
      (row.kind === "receivable" && row.status === "received");
    if (!isSettled) return;

    const label =
      row.kind === "payable"
        ? "Excluir o pagamento desta conta? Ela voltará para 'A pagar' e o vínculo com o extrato bancário será desfeito."
        : "Excluir o recebimento desta conta? Ela voltará para 'A receber' e o vínculo com o extrato bancário será desfeito.";
    if (!window.confirm(label)) return;

    setReverting(row.id);
    try {
      const id = row.raw?.id;
      if (!id) throw new Error("ID do lançamento não encontrado.");
      if (row.kind === "payable") {
        const { error } = await supabase
          .from("accounts_payable")
          .update({ status: "open", paid_at: null, bank_transaction_id: null })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts_receivable")
          .update({ status: "open", received_at: null, bank_transaction_id: null })
          .eq("id", id);
        if (error) throw error;
      }
      toast({
        title: row.kind === "payable" ? "Pagamento estornado" : "Recebimento estornado",
        description: "O lançamento voltou para 'em aberto'.",
      });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao estornar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setReverting(null);
    }
  };

  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDeleteEntry = async (row: StatementRow) => {
    if (row.kind !== "payable" && row.kind !== "receivable") return;
    const id = row.raw?.id;
    if (!id) return;

    const isLinkedToInvoice = row.kind === "payable" && row.raw?.inventory_invoices;
    if (isLinkedToInvoice) {
      toast({
        title: "Não é possível excluir",
        description: "Este lançamento foi gerado a partir de uma nota fiscal de entrada. Exclua a nota correspondente.",
        variant: "destructive",
      });
      return;
    }

    const label =
      row.kind === "payable"
        ? `Excluir definitivamente esta conta a pagar?\n\n${row.description}\nValor: ${fmtBRL(Math.abs(row.amount))}\n\nEsta ação não pode ser desfeita.`
        : `Excluir definitivamente esta conta a receber?\n\n${row.description}\nValor: ${fmtBRL(Math.abs(row.amount))}\n\nEsta ação não pode ser desfeita.`;
    if (!window.confirm(label)) return;

    setDeleting(row.id);
    try {
      const table = row.kind === "payable" ? "accounts_payable" : "accounts_receivable";
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Lançamento excluído" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const exportXlsx = () => {
    const data = filtered.map((r) => ({
      Vencimento: fmtDate(r.due_date),
      Pagamento: fmtDate(r.paid_date),
      Tipo: r.kind === "payable" ? "A pagar" : r.kind === "receivable" ? "A receber" : r.kind === "transfer" ? "Transferência" : "Banco",
      Loja: r.store ?? "",
      Fornecedor: r.party ?? "",
      Descrição: r.description,
      Categoria: r.category ?? "",
      Valor: r.amount,
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    XLSX.writeFile(wb, `extrato-${monthCursor}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      {/* Mobile: 3 KPIs principais + detalhes colapsáveis */}
      <div className="sm:hidden space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground leading-tight">Entradas</div>
              <div className="text-sm font-bold text-emerald-600 tabular-nums">{fmtBRL(totals.income)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground leading-tight">Saídas</div>
              <div className="text-sm font-bold text-destructive tabular-nums">{fmtBRL(totals.expense)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground leading-tight">Líquido</div>
              <div className={`text-sm font-bold tabular-nums ${totals.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {fmtBRL(totals.net)}
              </div>
            </CardContent>
          </Card>
        </div>
        <details className="rounded-md border bg-card">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium flex items-center justify-between">
            <span>Pendentes, vencidos e a vencer</span>
            <span className="text-muted-foreground">▾</span>
          </summary>
          <div className="px-3 pb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border p-2">
              <div className="text-[10px] text-muted-foreground">Vencidos</div>
              <div className="font-bold text-destructive tabular-nums">{fmtBRL(totals.overdueOut)}</div>
              {totals.overdueIn > 0 && (
                <div className="text-[10px] text-emerald-600">+{fmtBRL(totals.overdueIn)}</div>
              )}
            </div>
            <div className="rounded border p-2">
              <div className="text-[10px] text-muted-foreground">A vencer</div>
              <div className="font-bold text-amber-600 tabular-nums">{fmtBRL(totals.upcomingOut)}</div>
              {totals.upcomingIn > 0 && (
                <div className="text-[10px] text-emerald-600">+{fmtBRL(totals.upcomingIn)}</div>
              )}
            </div>
            <div className="rounded border p-2">
              <div className="text-[10px] text-muted-foreground">Pendentes</div>
              <div className="text-[11px] font-medium">
                <span className="text-emerald-600">+{fmtBRL(totals.pendingIn)}</span>
                <span className="mx-0.5 text-muted-foreground">/</span>
                <span className="text-destructive">-{fmtBRL(totals.pendingOut)}</span>
              </div>
            </div>
            <div className="rounded border p-2">
              <div className="text-[10px] text-muted-foreground">Pagos / Recebidos</div>
              <div className="text-[11px] font-medium">
                <span className="text-destructive">-{fmtBRL(totals.paid)}</span>
                <span className="mx-0.5 text-muted-foreground">/</span>
                <span className="text-emerald-600">+{fmtBRL(totals.received)}</span>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* Desktop/tablet: grid completo */}
      <div className="hidden sm:grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Entradas (período)</div>
            <div className="text-lg md:text-xl font-bold text-emerald-600">{fmtBRL(totals.income)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Saídas (período)</div>
            <div className="text-lg md:text-xl font-bold text-destructive">{fmtBRL(totals.expense)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Resultado líquido</div>
            <div className={`text-lg md:text-xl font-bold ${totals.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmtBRL(totals.net)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Pendentes</div>
            <div className="text-sm font-medium">
              <span className="text-emerald-600">+{fmtBRL(totals.pendingIn)}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-destructive">-{fmtBRL(totals.pendingOut)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Vencidos</div>
            <div className="text-lg md:text-xl font-bold text-destructive">{fmtBRL(totals.overdueOut)}</div>
            {totals.overdueIn > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                a receber: <span className="text-emerald-600">{fmtBRL(totals.overdueIn)}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">A vencer</div>
            <div className="text-lg md:text-xl font-bold text-amber-600">{fmtBRL(totals.upcomingOut)}</div>
            {totals.upcomingIn > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                a receber: <span className="text-emerald-600">{fmtBRL(totals.upcomingIn)}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Pagos / Recebidos</div>
            <div className="text-sm font-medium">
              <span className="text-destructive">-{fmtBRL(totals.paid)}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-emerald-600">+{fmtBRL(totals.received)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="corrente">Corrente</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {/* Filters + actions */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
              <div className="relative col-span-2 sm:col-span-3 lg:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar (descrição, fornecedor, nº lanç.)"
                  className="pl-8"
                />
              </div>
              <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
                <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="payable">A pagar</SelectItem>
                  <SelectItem value="receivable">A receber</SelectItem>
                  <SelectItem value="transfer">Transferências</SelectItem>
                  <SelectItem value="bank">Banco (extrato)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="open">Em aberto</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                  <SelectItem value="settled">Liquidados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateField} onValueChange={(v) => setDateField(v as DateField)}>
                <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">Data de vencimento</SelectItem>
                  <SelectItem value="paid">Data de pagamento</SelectItem>
                  <SelectItem value="competence">Data de competência</SelectItem>
                </SelectContent>
              </Select>
              <Popover open={monthOpen} onOpenChange={setMonthOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-10 lg:w-40 justify-start">
                    <CalendarDays className="h-4 w-4" />
                    {monthLabelText}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <div className="flex items-center justify-between mb-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-12)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">{monthCursor.split("-")[0]}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(12)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const year = Number(monthCursor.split("-")[0]);
                      const mKey = `${year}-${String(i + 1).padStart(2, "0")}`;
                      const label = new Date(year, i, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                      const isActive = mKey === monthCursor;
                      return (
                        <Button
                          key={i}
                          size="sm"
                          variant={isActive ? "default" : "ghost"}
                          className="h-8 text-xs capitalize"
                          onClick={() => {
                            setMonthCursor(mKey);
                            setMonthOpen(false);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between gap-1">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => { setMonthCursor(todayIso); setMonthOpen(false); }}>
                      Mês atual
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => shiftMonth(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => shiftMonth(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => exportXlsx()} className="gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar XLSX
              </Button>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
                <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : "hidden"}`} />
                Atualizar
              </Button>
              {onNewPayable && (
                <Button size="sm" variant="outline" onClick={onNewPayable} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> A pagar
                </Button>
              )}
              <Button size="sm" variant="outline" asChild className="gap-1">
                <Link to="/receber#sem-nota">
                  <ShoppingBasket className="h-3.5 w-3.5" /> Compra s/ NF
                </Link>
              </Button>
              {onNewReceivable && (
                <Button size="sm" variant="outline" onClick={onNewReceivable} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> A receber
                </Button>
              )}
              {onNewTransfer && (
                <Button size="sm" variant="outline" onClick={onNewTransfer} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Transferência
                </Button>
              )}
            </div>
          </div>

          {/* Statement table */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {rows.length > 0
                  ? "Nenhum lançamento encontrado com os filtros atuais."
                  : "Nenhum lançamento cadastrado ainda."}
              </p>
              {(search || kindFilter !== "all" || statusFilter !== "all") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setKindFilter("all");
                    setStatusFilter("all");
                    setMonthCursor(todayIso);
                    setDateField("due");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2"></TableHead>
                    <TableHead className="whitespace-nowrap px-2">Vencimento</TableHead>
                    <TableHead className="px-2">Loja</TableHead>
                    <TableHead className="px-2">Fornecedor</TableHead>
                    <TableHead className="px-2">Descrição</TableHead>
                    <TableHead className="px-2">Categoria</TableHead>
                    <TableHead className="text-right whitespace-nowrap px-2">Valor</TableHead>
                    <TableHead className="px-2">Status</TableHead>
                    <TableHead className="w-[90px] text-right px-2">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const groups: { key: string; label: string; rows: StatementRow[]; income: number; expense: number }[] = [];
                    const monthKey = (r: StatementRow) => {
                      const d = r.due_date || r.paid_date || r.sort_date;
                      return d ? d.slice(0, 7) : "0000-00";
                    };
                    const monthLabel = (key: string) => {
                      if (key === "0000-00") return "Sem data";
                      const [y, m] = key.split("-");
                      const date = new Date(Number(y), Number(m) - 1, 1);
                      const txt = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                      return txt.charAt(0).toUpperCase() + txt.slice(1);
                    };
                    for (const row of filtered) {
                      const k = monthKey(row);
                      let g = groups.find((x) => x.key === k);
                      if (!g) {
                        g = { key: k, label: monthLabel(k), rows: [], income: 0, expense: 0 };
                        groups.push(g);
                      }
                      g.rows.push(row);
                      if (row.kind !== "transfer") {
                        if (row.amount >= 0) g.income += row.amount;
                        else g.expense += -row.amount;
                      }
                    }
                    return groups.flatMap((g) => [
                      <TableRow key={`hdr-${g.key}`} className="bg-muted/50 hover:bg-muted/50 sticky top-0">
                        <TableCell colSpan={6} className="px-2 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          {g.label} <span className="ml-2 text-muted-foreground/70 normal-case font-normal">({g.rows.length} {g.rows.length === 1 ? "lançamento" : "lançamentos"})</span>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs whitespace-nowrap">
                          <span className="text-emerald-600 font-semibold">+{fmtBRL(g.income)}</span>
                          <span className="mx-1 text-muted-foreground">/</span>
                          <span className="text-destructive font-semibold">-{fmtBRL(g.expense)}</span>
                        </TableCell>
                        <TableCell colSpan={2} className="px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap">
                          <span className={g.income - g.expense >= 0 ? "text-emerald-600" : "text-destructive"}>
                            = {fmtBRL(g.income - g.expense)}
                          </span>
                        </TableCell>
                      </TableRow>,
                      ...g.rows.map((row) => (
                        <TableRow
                          key={row.id}
                          onClick={() => setEditing({ kind: editableKindOf(row.kind), raw: row.raw })}
                          className="cursor-pointer"
                        >
                          <TableCell className="px-2"><KindIcon kind={row.kind} amount={row.amount} /></TableCell>
                          <TableCell className="whitespace-nowrap text-xs px-2">
                            {fmtDate(row.due_date)}
                          </TableCell>
                          <TableCell className="text-xs px-2">{row.store ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate px-2" title={row.party ?? ""}>
                            {row.party ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[240px] truncate px-2" title={row.description}>
                            {row.description}
                          </TableCell>
                          <TableCell className="text-xs px-2">{row.category ?? "—"}</TableCell>
                          <TableCell
                            className={`text-right font-semibold whitespace-nowrap px-2 ${
                              row.kind === "transfer"
                                ? "text-foreground"
                                : row.amount >= 0
                                ? "text-emerald-600"
                                : "text-destructive"
                            }`}
                          >
                            {row.kind === "transfer"
                              ? fmtBRL(row.amount)
                              : `${row.amount >= 0 ? "+" : "-"}${fmtBRL(Math.abs(row.amount))}`}
                          </TableCell>
                          <TableCell className="px-2">{statusBadge(row)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap px-2" onClick={(e) => e.stopPropagation()}>
                            {(row.kind === "payable" || row.kind === "receivable") && (
                              <div className="inline-flex items-center gap-0.5">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => setEditing({ kind: editableKindOf(row.kind), raw: row.raw })}
                                  title="Editar lançamento"
                                  aria-label="Editar"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {((row.kind === "payable" && row.status === "paid") ||
                                  (row.kind === "receivable" && row.status === "received")) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                                    disabled={reverting === row.id}
                                    onClick={() => handleRevertPayment(row)}
                                    title={row.kind === "payable" ? "Estornar pagamento (volta para 'A pagar')" : "Estornar recebimento (volta para 'A receber')"}
                                    aria-label="Estornar"
                                  >
                                    {reverting === row.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Undo2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  disabled={deleting === row.id}
                                  onClick={() => handleDeleteEntry(row)}
                                  title={row.kind === "payable" ? "Excluir conta a pagar" : "Excluir conta a receber"}
                                  aria-label="Excluir"
                                >
                                  {deleting === row.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )),
                    ]);
                  })()}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Mobile cards */}
          {!loading && filtered.length > 0 && (
            <div className="md:hidden space-y-3">
              {(() => {
                const groups: { key: string; label: string; rows: StatementRow[]; income: number; expense: number }[] = [];
                const monthKey = (r: StatementRow) => {
                  const d = r.due_date || r.paid_date || r.sort_date;
                  return d ? d.slice(0, 7) : "0000-00";
                };
                const monthLabel = (key: string) => {
                  if (key === "0000-00") return "Sem data";
                  const [y, m] = key.split("-");
                  const date = new Date(Number(y), Number(m) - 1, 1);
                  const txt = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                  return txt.charAt(0).toUpperCase() + txt.slice(1);
                };
                for (const row of filtered) {
                  const k = monthKey(row);
                  let g = groups.find((x) => x.key === k);
                  if (!g) { g = { key: k, label: monthLabel(k), rows: [], income: 0, expense: 0 }; groups.push(g); }
                  g.rows.push(row);
                  if (row.kind !== "transfer") {
                    if (row.amount >= 0) g.income += row.amount;
                    else g.expense += -row.amount;
                  }
                }
                return groups.map((g) => (
                  <div key={g.key} className="space-y-2">
                    <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 rounded-md">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.label} <span className="font-normal normal-case">({g.rows.length})</span>
                      </div>
                      <div className={`text-xs font-semibold whitespace-nowrap ${g.income - g.expense >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {fmtBRL(g.income - g.expense)}
                      </div>
                    </div>
                    {g.rows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setEditing({ kind: editableKindOf(row.kind), raw: row.raw })}
                        className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <KindIcon kind={row.kind} amount={row.amount} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{row.description}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {row.party ?? "—"}{row.store ? ` · ${row.store}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className={`text-sm font-semibold whitespace-nowrap ${row.kind === "transfer" ? "text-foreground" : row.amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {row.kind === "transfer" ? fmtBRL(row.amount) : `${row.amount >= 0 ? "+" : "-"}${fmtBRL(Math.abs(row.amount))}`}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-muted-foreground">
                            Venc: {fmtDate(row.due_date)}{row.category ? ` · ${row.category}` : ""}
                          </div>
                          {statusBadge(row)}
                        </div>
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <EditStatementRowDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        kind={editing?.kind ?? null}
        raw={editing?.raw ?? null}
        onSaved={load}
      />
    </div>
  );
}
