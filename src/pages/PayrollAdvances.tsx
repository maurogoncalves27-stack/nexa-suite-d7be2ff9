import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Ban, ChevronDown, ChevronRight, ChevronLeft, Wallet, CheckCircle2, RefreshCw, Pencil, Trash2 } from "lucide-react";


type AdvanceType = "advance" | "deduction" | "loan" | "earning" | "night_addition";
type AdvanceStatus = "pending" | "partially_applied" | "applied" | "cancelled";
type InstStatus = "pending" | "applied" | "cancelled";

type Employee = { id: string; full_name: string; status: string; store_id: string | null };
type Store = { id: string; name: string };

type Installment = {
  id: string;
  installment_number: number;
  amount: number;
  reference_year: number;
  reference_month: number;
  status: InstStatus;
  applied_at: string | null;
};

type Advance = {
  id: string;
  employee_id: string;
  store_id: string | null;
  type: AdvanceType;
  total_amount: number;
  installments_count: number;
  start_year: number;
  start_month: number;
  description: string | null;
  status: AdvanceStatus;
  created_at: string;
  employees?: { full_name: string } | null;
  stores?: { name: string } | null;
  payroll_advance_installments?: Installment[];
};

const TYPE_LABEL: Record<AdvanceType, string> = {
  advance: "Adiantamento (vale)",
  deduction: "Desconto avulso",
  loan: "Empréstimo parcelado",
  earning: "Acréscimo / bônus avulso",
  night_addition: "Adicional noturno",
};

const STATUS_LABEL: Record<AdvanceStatus, string> = {
  pending: "Pendente",
  partially_applied: "Parcial",
  applied: "Aplicado",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<AdvanceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  partially_applied: "default",
  applied: "default",
  cancelled: "destructive",
};

const INST_LABEL: Record<InstStatus, string> = {
  pending: "Pendente",
  applied: "Aplicado",
  cancelled: "Cancelado",
};

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function competencia(y: number, m: number) {
  return `${MESES[m - 1]}/${y}`;
}

export default function PayrollAdvances() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);

  // Aprovação mensal
  const today = new Date();
  const [refYear, setRefYear] = useState<number>(today.getFullYear());
  const [refMonth, setRefMonth] = useState<number>(today.getMonth() + 1);
  const [approved, setApproved] = useState<boolean>(false);
  const [approvLoading, setApprovLoading] = useState<boolean>(false);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fEmployee, setFEmployee] = useState("");
  const [fType, setFType] = useState<AdvanceType>("advance");
  const [fAmount, setFAmount] = useState("");
  const [fInstallments, setFInstallments] = useState("1");
  const [fYear, setFYear] = useState(String(today.getFullYear()));
  const [fMonth, setFMonth] = useState(String(today.getMonth() + 1));
  const [fDesc, setFDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [advRes, empRes, stRes] = await Promise.all([
      supabase
        .from("payroll_advances")
        .select(`
          *,
          employees:employee_id ( full_name ),
          stores:store_id ( name ),
          payroll_advance_installments ( id, installment_number, amount, reference_year, reference_month, status, applied_at )
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id, full_name, status, store_id")
        .neq("status", "terminated")
        .order("full_name"),
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
    ]);

    if (advRes.error) toast.error("Erro ao carregar lançamentos: " + advRes.error.message);
    else setAdvances((advRes.data ?? []) as any);

    if (empRes.data) setEmployees(empRes.data as Employee[]);
    if (stRes.data) setStores(stRes.data as Store[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function loadApproval(y: number, m: number) {
    const { data } = await (supabase as any)
      .from("payroll_advances_review")
      .select("id")
      .eq("reference_year", y)
      .eq("reference_month", m)
      .maybeSingle();
    setApproved(!!data);
  }

  useEffect(() => { loadApproval(refYear, refMonth); }, [refYear, refMonth]);

  async function handleApprove() {
    setApprovLoading(true);
    const { error } = await (supabase as any)
      .from("payroll_advances_review")
      .upsert({
        reference_year: refYear,
        reference_month: refMonth,
        approved_by: user?.id ?? null,
        approved_at: new Date().toISOString(),
      }, { onConflict: "reference_year,reference_month" });
    setApprovLoading(false);
    if (error) return toast.error("Erro ao aprovar: " + error.message);
    toast.success(`Acréscimos/descontos aprovados para ${competencia(refYear, refMonth)}`);
    setApproved(true);
  }

  async function invalidateApprovalIfNeeded(y: number, m: number) {
    if (y !== refYear || m !== refMonth) {
      // revoga aprovação do mês afetado, mesmo que não seja o selecionado
    }
    await (supabase as any)
      .from("payroll_advances_review")
      .delete()
      .eq("reference_year", y)
      .eq("reference_month", m);
    if (y === refYear && m === refMonth) setApproved(false);
  }

  const filtered = useMemo(() => {
    return advances.filter(a => {
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterType !== "all" && a.type !== filterType) return false;
      return true;
    });
  }, [advances, filterStatus, filterType]);

  function resetForm() {
    setEditingId(null);
    setFEmployee("");
    setFType("advance");
    setFAmount("");
    setFInstallments("1");
    setFYear(String(today.getFullYear()));
    setFMonth(String(today.getMonth() + 1));
    setFDesc("");
  }

  function openEdit(a: Advance) {
    setEditingId(a.id);
    setFEmployee(a.employee_id);
    setFType(a.type);
    setFAmount(String(a.total_amount).replace(".", ","));
    setFInstallments(String(a.installments_count));
    setFYear(String(a.start_year));
    setFMonth(String(a.start_month));
    setFDesc(a.description ?? "");
    setOpenNew(true);
  }

  async function handleSave() {
    if (!fEmployee) return toast.error("Selecione o colaborador");
    const amt = Number(fAmount.replace(",", "."));
    if (!amt || amt <= 0) return toast.error("Informe um valor válido");
    const inst = Number(fInstallments);
    if (!inst || inst < 1) return toast.error("Número de parcelas inválido");
    if (fType !== "loan" && inst !== 1) {
      return toast.error("Este tipo aceita apenas 1 parcela");
    }

    const emp = employees.find(e => e.id === fEmployee);
    setSaving(true);

    let error: any = null;
    let prevMonths: Array<[number, number]> = [];

    if (editingId) {
      const prev = advances.find((x) => x.id === editingId);
      if (prev) {
        const set = new Set<string>();
        (prev.payroll_advance_installments ?? [])
          .filter((i) => i.status === "pending")
          .forEach((i) => set.add(`${i.reference_year}-${i.reference_month}`));
        if (set.size === 0) set.add(`${prev.start_year}-${prev.start_month}`);
        prevMonths = Array.from(set).map((k) => k.split("-").map(Number) as [number, number]);
      }
      // Apaga parcelas pendentes antes de regenerar via trigger ao recriar
      await supabase.from("payroll_advance_installments").delete().eq("advance_id", editingId).eq("status", "pending");
      const res = await supabase.from("payroll_advances").update({
        employee_id: fEmployee,
        store_id: emp?.store_id ?? null,
        type: fType,
        total_amount: amt,
        installments_count: inst,
        start_year: Number(fYear),
        start_month: Number(fMonth),
        description: fDesc || null,
      }).eq("id", editingId);
      error = res.error;
      // Regenera parcelas pendentes (trigger só dispara em INSERT)
      if (!error) {
        const parcela = Math.round((amt / inst) * 100) / 100;
        const resto = Math.round((amt - parcela * inst) * 100) / 100;
        const rows: any[] = [];
        for (let i = 1; i <= inst; i++) {
          let mes = Number(fMonth) + (i - 1);
          let ano = Number(fYear);
          while (mes > 12) { mes -= 12; ano += 1; }
          rows.push({
            advance_id: editingId,
            employee_id: fEmployee,
            installment_number: i,
            amount: i === 1 ? parcela + resto : parcela,
            reference_year: ano,
            reference_month: mes,
            status: "pending",
          });
        }
        const ins = await supabase.from("payroll_advance_installments").insert(rows);
        if (ins.error) error = ins.error;
      }
    } else {
      const res = await supabase.from("payroll_advances").insert({
        employee_id: fEmployee,
        store_id: emp?.store_id ?? null,
        type: fType,
        total_amount: amt,
        installments_count: inst,
        start_year: Number(fYear),
        start_month: Number(fMonth),
        description: fDesc || null,
        created_by: user?.id ?? null,
      });
      error = res.error;
    }
    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success(editingId ? "Lançamento atualizado" : "Lançamento criado");
    setOpenNew(false);
    const wasEditing = !!editingId;
    resetForm();
    // invalida o mês novo + meses afetados anteriormente (em edição)
    await invalidateApprovalIfNeeded(Number(fYear), Number(fMonth));
    if (wasEditing) {
      for (const [y, m] of prevMonths) await invalidateApprovalIfNeeded(y, m);
    }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento? Esta ação não pode ser desfeita.")) return;
    const adv = advances.find((x) => x.id === id);
    // tenta excluir; se houver parcela aplicada (FK), faz fallback para cancelar
    const { error: delErr } = await supabase.from("payroll_advances").delete().eq("id", id);
    if (delErr) {
      const { error } = await supabase.from("payroll_advances").update({ status: "cancelled" }).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Lançamento já tem parcelas aplicadas — foi cancelado");
    } else {
      toast.success("Lançamento excluído");
    }
    if (adv) {
      const months = new Set<string>();
      (adv.payroll_advance_installments ?? [])
        .filter((i) => i.status === "pending")
        .forEach((i) => months.add(`${i.reference_year}-${i.reference_month}`));
      if (months.size === 0) months.add(`${adv.start_year}-${adv.start_month}`);
      for (const k of months) {
        const [y, m] = k.split("-").map(Number);
        await invalidateApprovalIfNeeded(y, m);
      }
    }
    load();
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Acréscimos e descontos
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Vales, descontos avulsos, empréstimos parcelados e acréscimos/bônus — aplicados automaticamente na folha calculada.
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Novo lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Colaborador</Label>
                <Select value={fEmployee} onValueChange={setFEmployee}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={fType} onValueChange={(v) => {
                  setFType(v as AdvanceType);
                  if (v !== "loan") setFInstallments("1");
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">Adiantamento (vale)</SelectItem>
                    <SelectItem value="deduction">Desconto avulso</SelectItem>
                    <SelectItem value="loan">Empréstimo parcelado</SelectItem>
                    <SelectItem value="earning">Acréscimo / bônus avulso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Valor total (R$)</Label>
                  <Input inputMode="decimal" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Parcelas</Label>
                  <Input
                    type="number" min={1}
                    value={fInstallments}
                    onChange={(e) => setFInstallments(e.target.value)}
                    disabled={fType !== "loan"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Mês inicial</Label>
                  <Select value={fMonth} onValueChange={setFMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ano inicial</Label>
                  <Input type="number" value={fYear} onChange={(e) => setFYear(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Descrição / motivo</Label>
                <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Ex: vale para emergência médica, desconto de uniforme..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Aprovação mensal — obrigatória para gerar a folha */}
      <Card className={approved ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              {approved ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aprovado para {competencia(refYear, refMonth)}</>
              ) : (
                <>Aprovação pendente para {competencia(refYear, refMonth)}</>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A folha só pode ser gerada após aprovar os acréscimos e descontos do mês.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="icon" className="h-9 w-9"
                aria-label="Mês anterior"
                onClick={() => {
                  if (refMonth === 1) { setRefMonth(12); setRefYear(refYear - 1); }
                  else setRefMonth(refMonth - 1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="capitalize text-sm font-medium min-w-[140px] text-center px-2">
                {MESES[refMonth - 1]} {refYear}
              </span>
              <Button
                variant="outline" size="icon" className="h-9 w-9"
                aria-label="Próximo mês"
                onClick={() => {
                  if (refMonth === 12) { setRefMonth(1); setRefYear(refYear + 1); }
                  else setRefMonth(refMonth + 1);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {approved ? (
              <Button
                variant="outline"
                disabled={approvLoading}
                onClick={async () => {
                  setApprovLoading(true);
                  await invalidateApprovalIfNeeded(refYear, refMonth);
                  setApprovLoading(false);
                  toast.success("Aprovação revogada");
                }}
              >
                {approvLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Revogar aprovação
              </Button>
            ) : (
              <Button onClick={handleApprove} disabled={approvLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {approvLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Aprovar acréscimos/descontos deste mês
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="sm:w-[220px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="advance">Adiantamento (vale)</SelectItem>
            <SelectItem value="deduction">Desconto avulso</SelectItem>
            <SelectItem value="loan">Empréstimo parcelado</SelectItem>
            <SelectItem value="earning">Acréscimo / bônus avulso</SelectItem>
            
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="partially_applied">Parcial</SelectItem>
            <SelectItem value="applied">Aplicado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento encontrado.
        </CardContent></Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {filtered.map(a => (
              <AdvanceCard
                key={a.id}
                advance={a}
                expanded={!!expanded[a.id]}
                onToggle={() => setExpanded(s => ({ ...s, [a.id]: !s[a.id] }))}
                onEdit={() => openEdit(a)}
                onDelete={() => handleDelete(a.id)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <>
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => setExpanded(s => ({ ...s, [a.id]: !s[a.id] }))}>
                        <TableCell>{expanded[a.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="font-medium">{a.employees?.full_name ?? "—"}</TableCell>
                        <TableCell>{TYPE_LABEL[a.type]}</TableCell>
                        <TableCell className="text-right">{fmtBRL(Number(a.total_amount))}</TableCell>
                        <TableCell>{a.installments_count}x</TableCell>
                        <TableCell>{competencia(a.start_year, a.start_month)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {a.status !== "cancelled" && a.status !== "applied" && (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Editar lançamento" aria-label="Editar lançamento">
                                <Pencil className="h-4 w-4 mr-1" /> Editar
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)} title="Excluir lançamento" aria-label="Excluir lançamento">
                                <Trash2 className="h-4 w-4 mr-1" /> Excluir
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded[a.id] && (
                        <TableRow key={a.id + "-exp"}>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <InstallmentsList items={a.payroll_advance_installments ?? []} description={a.description} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AdvanceCard({ advance: a, expanded, onToggle, onEdit, onDelete }: {
  advance: Advance; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{a.employees?.full_name ?? "—"}</CardTitle>
            <p className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]}</p>
          </div>
          <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Valor</span>
          <span className="font-medium">{fmtBRL(Number(a.total_amount))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Parcelas</span>
          <span>{a.installments_count}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Início</span>
          <span>{competencia(a.start_year, a.start_month)}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={onToggle}>
            {expanded ? "Esconder parcelas" : "Ver parcelas"}
          </Button>
          {a.status !== "cancelled" && a.status !== "applied" && (
            <>
              <Button size="sm" variant="outline" onClick={onEdit} aria-label="Editar lançamento">
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete} aria-label="Excluir lançamento">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            </>
          )}
        </div>
        {expanded && (
          <div className="pt-2 border-t">
            <InstallmentsList items={a.payroll_advance_installments ?? []} description={a.description} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InstallmentsList({ items, description }: { items: Installment[]; description: string | null }) {
  const sorted = [...items].sort((a, b) => a.installment_number - b.installment_number);
  return (
    <div className="space-y-2">
      {description && (
        <p className="text-sm text-muted-foreground"><span className="font-medium">Motivo:</span> {description}</p>
      )}
      <div className="grid gap-1">
        {sorted.map(i => (
          <div key={i.id} className="flex items-center justify-between text-sm">
            <span>{i.installment_number}. {competencia(i.reference_year, i.reference_month)}</span>
            <div className="flex items-center gap-2">
              <span>{fmtBRL(Number(i.amount))}</span>
              <Badge variant={i.status === "applied" ? "default" : i.status === "cancelled" ? "destructive" : "secondary"}>
                {INST_LABEL[i.status]}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
