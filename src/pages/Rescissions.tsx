import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, FileDown, ChevronLeft, ChevronRight, CalendarDays, FileSpreadsheet, Wallet, Calculator } from "lucide-react";
import { format } from "date-fns";
import { generateTrctPdf } from "@/lib/trctPdf";
import { toast } from "@/hooks/use-toast";
import { exportC6PixFile } from "@/lib/c6Export";
import {
  calcRescission,
  TERMINATION_REASON_LABELS,
  type TerminationReason,
  type RescissionResult,
} from "@/lib/rescissionCalc";

const RESCISAO_CATEGORY_ID = "0b7e76ad-8667-44b4-8632-0a113be545ba";

interface Emp {
  id: string;
  full_name: string | null;
  cpf: string | null;
  contract_type: string | null;
  termination_date: string | null;
  termination_reason: TerminationReason | null;
  hire_date: string | null;
  salary: number | null;
  position: string | null;
  store_id: string | null;
  allocated_store_id: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
}
interface Pay {
  id: string;
  employee_id: string;
  amount: number;
  reference_date: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  exported_at: string | null;
}

const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const isCLT = (t: string | null) => {
  const s = (t || "").toLowerCase();
  return s.includes("clt") || s.includes("efetivo") || s.includes("experiência") || s.includes("experiencia") || s.includes("indeterminado") || s.includes("determinado");
};

export default function Rescissions() {
  const [loading, setLoading] = useState(true);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [depCount, setDepCount] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [savingReason, setSavingReason] = useState<string | null>(null);
  const [fgtsBalances, setFgtsBalances] = useState<Record<string, string>>({});
  const today = new Date();
  const [refDate, setRefDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const ref = { year: refDate.getFullYear(), month: refDate.getMonth() + 1 };
  const isCurrentMonth = ref.year === today.getFullYear() && ref.month === today.getMonth() + 1;
  const monthLabel = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const goPrev = () => setRefDate(new Date(ref.year, ref.month - 2, 1));
  const goNext = () => setRefDate(new Date(ref.year, ref.month, 1));
  const goCurrent = () => setRefDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const reload = async () => {
    setLoading(true);
    const start = `${ref.year}-${String(ref.month).padStart(2, "0")}-01`;
    const lastDay = new Date(ref.year, ref.month, 0).getDate();
    const end = `${ref.year}-${String(ref.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const [{ data: empData }, { data: payData }] = await Promise.all([
      (supabase as any)
        .from("employees")
        .select("id, full_name, cpf, contract_type, termination_date, termination_reason, hire_date, salary, position, store_id, allocated_store_id, pix_key, pix_key_type")
        .gte("termination_date", start)
        .lte("termination_date", end)
        .order("termination_date", { ascending: false }),
      (supabase as any)
        .from("internship_payments")
        .select("id, employee_id, amount, reference_date, payment_date, notes, created_at, exported_at")
        .ilike("notes", "RESCISÃO%"),
    ]);
    const empList = (empData ?? []) as Emp[];
    setEmps(empList);
    setPays((payData ?? []) as Pay[]);

    if (empList.length > 0) {
      const ids = empList.map((e) => e.id);
      const { data: deps } = await (supabase as any)
        .from("employee_dependents")
        .select("employee_id")
        .in("employee_id", ids);
      const counts: Record<string, number> = {};
      (deps ?? []).forEach((d: any) => { counts[d.employee_id] = (counts[d.employee_id] || 0) + 1; });
      setDepCount(counts);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ref.year, ref.month]);

  const payByEmp = useMemo(() => {
    const m = new Map<string, Pay>();
    pays.forEach((p) => { if (!m.has(p.employee_id)) m.set(p.employee_id, p); });
    return m;
  }, [pays]);

  // Cálculo CLT por colaborador
  const cltCalcs = useMemo(() => {
    const map = new Map<string, RescissionResult | null>();
    for (const e of emps) {
      if (!isCLT(e.contract_type)) { map.set(e.id, null); continue; }
      if (!e.termination_reason || !e.hire_date || !e.termination_date || !e.salary) {
        map.set(e.id, null);
        continue;
      }
      const fgtsRaw = fgtsBalances[e.id];
      const fgtsBalance = fgtsRaw ? Number(fgtsRaw.replace(",", ".")) : 0;
      try {
        map.set(e.id, calcRescission({
          salary: Number(e.salary),
          hireDate: e.hire_date,
          terminationDate: e.termination_date,
          reason: e.termination_reason,
          dependentsIRRF: depCount[e.id] || 0,
          fgtsBalance,
        }));
      } catch {
        map.set(e.id, null);
      }
    }
    return map;
  }, [emps, depCount, fgtsBalances]);

  const payable = useMemo(() => {
    return emps
      .map((e) => {
        const pay = payByEmp.get(e.id);
        const calc = cltCalcs.get(e.id);
        const amount = pay ? Number(pay.amount) : (calc?.net ?? 0);
        return { emp: e, pay, calc, amount };
      })
      .filter((r) => r.amount > 0 && (!r.pay || !r.pay.exported_at));
  }, [emps, payByEmp, cltCalcs]);

  const payableTotal = useMemo(
    () => payable.reduce((s, r) => s + r.amount, 0),
    [payable],
  );

  const updateReason = async (empId: string, reason: TerminationReason) => {
    setSavingReason(empId);
    const { error } = await (supabase as any)
      .from("employees")
      .update({ termination_reason: reason })
      .eq("id", empId);
    setSavingReason(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setEmps((prev) => prev.map((e) => e.id === empId ? { ...e, termination_reason: reason } : e));
  };

  const handleTrct = async (e: Emp) => {
    setGenerating(e.id);
    try {
      const pay = payByEmp.get(e.id);
      const calc = cltCalcs.get(e.id);
      await generateTrctPdf(e.id, {
        amount: pay ? Number(pay.amount) : (calc?.net ?? undefined),
        terminationDate: e.termination_date || undefined,
      });
    } catch (err: any) {
      toast({ title: "Erro ao gerar TRCT", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const [exportingId, setExportingIdLocal] = useState<string | null>(null);
  const [launchingId, setLaunchingIdLocal] = useState<string | null>(null);

  const exportC6One = async (row: { emp: Emp; amount: number }) => {
    if (row.amount <= 0) {
      toast({ title: "Sem valor", description: "Cálculo não disponível.", variant: "destructive" });
      return;
    }
    if (!row.emp.pix_key || !row.emp.pix_key.trim()) {
      toast({ title: "Sem PIX", description: `${row.emp.full_name} não possui chave PIX cadastrada.`, variant: "destructive" });
      return;
    }
    setExportingIdLocal(row.emp.id);
    try {
      const safe = (row.emp.full_name ?? "colaborador").replace(/[^a-zA-Z0-9]+/g, "_");
      const { included } = await exportC6PixFile({
        rows: [{
          name: row.emp.full_name ?? "",
          pixKey: row.emp.pix_key,
          pixKeyType: row.emp.pix_key_type ?? null,
          amount: row.amount,
          description: `Rescisão ${MONTHS_PT[ref.month - 1]}/${ref.year}`,
        }],
        fileName: `c6-rescisao-${safe}-${ref.year}-${String(ref.month).padStart(2, "0")}`,
      });
      if (included === 0) {
        toast({ title: "Sem chaves PIX", description: "PIX inválido.", variant: "destructive" });
        return;
      }
      toast({ title: "Planilha C6 gerada", description: row.emp.full_name ?? "" });
    } catch (e: any) {
      toast({ title: "Falhou ao gerar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExportingIdLocal(null);
    }
  };

  const launchOne = async (row: { emp: Emp; amount: number }) => {
    if (row.amount <= 0) {
      toast({ title: "Sem valor", description: "Cálculo não disponível.", variant: "destructive" });
      return;
    }
    const storeId = row.emp.allocated_store_id || row.emp.store_id;
    if (!storeId) {
      toast({ title: "Sem loja", description: "Colaborador sem loja vinculada.", variant: "destructive" });
      return;
    }
    const periodo = `${MONTHS_PT[ref.month - 1]}/${ref.year}`;
    if (!window.confirm(
      `Lançar rescisão de ${row.emp.full_name} no contas a pagar?\n${periodo} · ${money(row.amount)}.`,
    )) return;

    setLaunchingIdLocal(row.emp.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("accounts_payable").insert({
        store_id: storeId,
        category_id: RESCISAO_CATEGORY_ID,
        supplier_name: row.emp.full_name ?? "—",
        description: `Rescisão ${periodo}`,
        amount: Number(row.amount.toFixed(2)),
        due_date: new Date().toISOString().slice(0, 10),
        status: "pending" as const,
        installment_number: 1,
        created_by: user.id,
      } as any);
      if (error) {
        toast({ title: "Falhou ao lançar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Lançado", description: `${row.emp.full_name} · ${money(row.amount)}` });
    } finally {
      setLaunchingIdLocal(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Rescisões
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Desligamentos do mês · cálculo CLT (saldo, 13º, férias, aviso, INSS, IRRF) · TRCT (art. 477) · recesso para estagiários
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap md:shrink-0">
          <CalendarDays className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Mês anterior" className="shrink-0 h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 py-1.5 border rounded-md text-xs text-center bg-background min-w-[180px] capitalize">
            <span className="font-semibold">{monthLabel}</span>
            {isCurrentMonth && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary font-semibold">Atual</span>}
          </div>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Próximo mês" className="shrink-0 h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={goCurrent} className="text-xs h-9">Atual</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          {/* Resumo do mês (sem ações em lote) */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="text-sm">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total a pagar</span>
              <span className="ml-2 font-bold">{money(payableTotal)}</span>
              <span className="ml-1 text-xs text-muted-foreground">({payable.length})</span>
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Pagamentos individuais por colaborador
            </span>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : emps.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Nenhum desligamento em {MONTHS_PT[ref.month - 1]}/{ref.year}.
            </div>
          ) : (
            <div className="space-y-2">
              {emps.map((e) => {
                const pay = payByEmp.get(e.id);
                const clt = isCLT(e.contract_type);
                const calc = cltCalcs.get(e.id);
                const displayAmount = pay ? Number(pay.amount) : (calc?.net ?? 0);
                const missing: string[] = [];
                if (clt) {
                  if (!e.termination_reason) missing.push("motivo");
                  if (!e.hire_date) missing.push("admissão");
                  if (!e.salary) missing.push("salário");
                }
                return (
                  <div key={e.id} className="rounded border p-3 space-y-2 bg-card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{e.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          CPF {e.cpf ?? "—"} · {e.contract_type ?? "—"}{e.position ? ` · ${e.position}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Admissão {e.hire_date ? format(new Date(e.hire_date + "T00:00:00"), "dd/MM/yyyy") : "—"} · Desligado em {e.termination_date ? format(new Date(e.termination_date + "T00:00:00"), "dd/MM/yyyy") : "—"}
                          {e.salary ? ` · salário ${money(Number(e.salary))}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        {displayAmount > 0 ? (
                          <>
                            <div className="text-base font-semibold">{money(displayAmount)}</div>
                            <Badge variant={pay?.exported_at ? "default" : "secondary"} className="text-xs mt-1">
                              {pay?.exported_at ? "Pago" : pay ? "A pagar" : "Calculado"}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            {clt && missing.length > 0 ? `Falta: ${missing.join(", ")}` : "Sem cálculo"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {clt && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Motivo do desligamento</Label>
                          <Select
                            value={e.termination_reason ?? ""}
                            onValueChange={(v) => updateReason(e.id, v as TerminationReason)}
                            disabled={savingReason === e.id}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Selecione o motivo…" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(TERMINATION_REASON_LABELS) as TerminationReason[]).map((k) => (
                                <SelectItem key={k} value={k} className="text-xs">{TERMINATION_REASON_LABELS[k]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo FGTS (opcional)</Label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="0,00"
                            value={fgtsBalances[e.id] ?? ""}
                            onChange={(ev) => setFgtsBalances((p) => ({ ...p, [e.id]: ev.target.value }))}
                            className="h-9 text-xs sm:w-[140px]"
                          />
                        </div>
                      </div>
                    )}

                    {clt && calc && (
                      <details className="text-xs border-t pt-2">
                        <summary className="cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground">
                          <Calculator className="h-3.5 w-3.5" /> Memória de cálculo
                        </summary>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="font-semibold text-[11px] uppercase mb-1 text-muted-foreground">Proventos</div>
                            <div className="space-y-0.5">
                              {calc.earnings.map((l, i) => (
                                <div key={i} className="flex justify-between gap-2">
                                  <span className="truncate">
                                    {l.label}
                                    {l.detail && <span className="text-muted-foreground"> · {l.detail}</span>}
                                  </span>
                                  <span className="tabular-nums">{money(l.amount)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-semibold pt-1 border-t mt-1">
                                <span>Total proventos</span>
                                <span className="tabular-nums">{money(calc.earningsTotal)}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-[11px] uppercase mb-1 text-muted-foreground">Descontos</div>
                            <div className="space-y-0.5">
                              {calc.deductions.length === 0 && <div className="text-muted-foreground">—</div>}
                              {calc.deductions.map((l, i) => (
                                <div key={i} className="flex justify-between gap-2">
                                  <span className="truncate">
                                    {l.label}
                                    {l.detail && <span className="text-muted-foreground"> · {l.detail}</span>}
                                  </span>
                                  <span className="tabular-nums">{money(l.amount)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-semibold pt-1 border-t mt-1">
                                <span>Total descontos</span>
                                <span className="tabular-nums">{money(calc.deductionsTotal)}</span>
                              </div>
                              <div className="flex justify-between font-bold pt-1 border-t mt-1">
                                <span>Líquido</span>
                                <span className="tabular-nums">{money(calc.net)}</span>
                              </div>
                              {calc.fgtsFine !== undefined && calc.fgtsFine > 0 && (
                                <div className="flex justify-between text-muted-foreground pt-1">
                                  <span>Multa FGTS (informativa, via GRRF)</span>
                                  <span className="tabular-nums">{money(calc.fgtsFine)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {calc.notes.length > 0 && (
                          <ul className="mt-2 list-disc pl-4 text-muted-foreground space-y-0.5">
                            {calc.notes.map((n, i) => (<li key={i}>{n}</li>))}
                          </ul>
                        )}
                      </details>
                    )}

                    {pay?.notes && (
                      <div className="text-xs whitespace-pre-wrap text-muted-foreground border-t pt-2">
                        {pay.notes}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {clt && (
                        <Button size="sm" variant="outline" onClick={() => handleTrct(e)} disabled={generating === e.id}>
                          {generating === e.id
                            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            : <FileDown className="h-3.5 w-3.5 mr-1" />}
                          Gerar TRCT
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportC6One({ emp: e, amount: displayAmount })}
                        disabled={exportingId === e.id || displayAmount <= 0 || !e.pix_key}
                        title={!e.pix_key ? "Sem chave PIX" : undefined}
                      >
                        {exportingId === e.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
                        Exportar C6
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => launchOne({ emp: e, amount: displayAmount })}
                        disabled={launchingId === e.id || displayAmount <= 0 || (!!pay && !!pay.exported_at)}
                      >
                        {launchingId === e.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <Wallet className="h-3.5 w-3.5 mr-1" />}
                        Lançar a pagar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
