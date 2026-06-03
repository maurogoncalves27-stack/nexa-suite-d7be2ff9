import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, ChevronRight as ChevronRightIcon, Check, Trash2, CheckCheck, Lock, Hourglass, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useToast } from "@/hooks/use-toast";
import { usePayrollLock } from "@/hooks/usePayrollLock";

interface ImportRow {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  cpf: string | null;
  registration_number: string | null;
  position: string | null;
  salary: number;
  total_earnings: number;
  total_discounts: number;
  net_amount: number;
  worked_days?: number | null;
  admission_date?: string | null;
}
interface ImportMeta {
  id: string;
  ref_year: number;
  ref_month: number;
  sent_to_accounting_at?: string | null;
  accounting_ok_at?: string | null;
  consolidated_at?: string | null;
}
interface RubricRow {
  id: string;
  row_id: string;
  code: string | null;
  description: string | null;
  kind: "earning" | "deduction" | "informative";
  value: number;
}

const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMonth = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const fmtWorkedDays = (wd: number | null | undefined, y: number, m: number, admission?: string | null) => {
  if (wd == null) return "—";
  const total = daysInMonth(y, m);
  const parts: string[] = [`${wd}/${total} dias`];
  if (admission) {
    const d = new Date(admission);
    const admY = d.getFullYear();
    const admM = d.getMonth() + 1;
    if (admY === y && admM === m) {
      parts.push(`${d.getDate().toString().padStart(2, "0")}/${m.toString().padStart(2, "0")} – ${total.toString().padStart(2, "0")}/${m.toString().padStart(2, "0")}`);
    }
  }
  return parts.join(" ");
};
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const isInternshipEmployee = (e?: any) => {
  const ct = norm(e?.contract_type ?? "");
  const pos = norm(e?.position ?? "");
  const cat = String(e?.esocial_category ?? "").trim();
  return ct.includes("estag") || ct === "internship" || pos.includes("estagi") || cat === "701";
};

export default function SimpleManagerPayrollPanel() {
  // Mês de referência = mês anterior ao atual (folha do mês X é paga em X+1)
  const defaultRef = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  };
  const [ref, setRef] = useState(defaultRef);
  const refYear = ref.year;
  const refMonth = ref.month;
  const today = new Date();
  const maxRef = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const isAtMax = refYear === maxRef.year && refMonth === maxRef.month;
  const defaultR = defaultRef();
  const isAtDefault = refYear === defaultR.year && refMonth === defaultR.month;
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rubricsByRow, setRubricsByRow] = useState<Record<string, RubricRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [okIds, setOkIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingRubricId, setEditingRubricId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingRubricId, setSavingRubricId] = useState<string | null>(null);

  // Mapeamento "Descrição da rubrica sintética" -> coluna em payroll_calculated.
  // Itens em calculation_details ficam em JSON e são tratados à parte.
  const CALC_COLUMN_BY_DESC: Record<string, string> = {
    "Salário proporcional": "proportional_salary",
    "Produtividade 5%": "productivity",
    "Salário Família": "family_allowance",
    "Outros proventos": "other_earnings",
    "Adiantamentos": "advance",
    "Vale-transporte": "transport_discount",
    "Plano de saúde": "health_plan",
    "INSS": "inss",
    "IRRF": "irrf",
    "Infrações": "infraction_discount",
    "Faltas": "absence_discount",
    "DSR Falta": "dsr_loss_discount",
    "Outros descontos": "other_discounts",
  };
  const CALC_JSON_BY_DESC: Record<string, string> = {
    "Adicional Noturno": "night_addition",
    "Feriados Trabalhados": "holiday_pay",
  };

  const parseMoneyInput = (s: string): number => {
    const norm = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    return Number.isFinite(n) ? n : 0;
  };

  const startEditRubric = (rb: RubricRow) => {
    if (isLocked) { toast.error("Folha consolidada/aprovada — somente leitura"); return; }
    setEditingRubricId(rb.id);
    setEditValue(String(rb.value).replace(".", ","));
  };

  const recomputeTotalsLocal = (rowId: string, newRubs: RubricRow[]) => {
    const earnings = newRubs.filter((x) => x.kind === "earning").reduce((s, x) => s + Number(x.value || 0), 0);
    const discounts = newRubs.filter((x) => x.kind === "deduction").reduce((s, x) => s + Number(x.value || 0), 0);
    const net = earnings - discounts;
    setRows((prev) => prev.map((r) => r.id === rowId
      ? { ...r, total_earnings: earnings, total_discounts: discounts, net_amount: net }
      : r));
    return { earnings, discounts, net };
  };

  const saveRubric = async (rb: RubricRow) => {
    if (isLocked) { setEditingRubricId(null); return; }
    const newVal = Math.max(0, parseMoneyInput(editValue));
    if (Math.abs(newVal - Number(rb.value)) < 0.005) { setEditingRubricId(null); return; }
    setSavingRubricId(rb.id);
    try {
      const updatedRubs = (rubricsByRow[rb.row_id] ?? []).map((x) =>
        x.id === rb.id ? { ...x, value: newVal } : x
      );
      setRubricsByRow((prev) => ({ ...prev, [rb.row_id]: updatedRubs }));
      const totals = recomputeTotalsLocal(rb.row_id, updatedRubs);

      if (isFromCalc) {
        const col = CALC_COLUMN_BY_DESC[rb.description ?? ""];
        const jsonKey = CALC_JSON_BY_DESC[rb.description ?? ""];
        const update: any = {
          total_earnings: totals.earnings,
          total_discounts: totals.discounts,
          net_pay: totals.net,
        };
        if (col) {
          update[col] = newVal;
        } else if (jsonKey) {
          const { data: cur } = await (supabase as any)
            .from("payroll_calculated")
            .select("calculation_details")
            .eq("id", rb.row_id)
            .maybeSingle();
          const cd = { ...(cur?.calculation_details ?? {}), [jsonKey]: newVal };
          update.calculation_details = cd;
        }
        const { error } = await (supabase as any)
          .from("payroll_calculated")
          .update(update)
          .eq("id", rb.row_id);
        if (error) throw error;
      } else {
        // payroll_import_rubrics (XML)
        const { error: rErr } = await (supabase as any)
          .from("payroll_import_rubrics")
          .update({ value: newVal })
          .eq("id", rb.id);
        if (rErr) throw rErr;
        const { error: rowErr } = await (supabase as any)
          .from("payroll_import_rows")
          .update({
            total_earnings: totals.earnings,
            total_discounts: totals.discounts,
            net_amount: totals.net,
          })
          .eq("id", rb.row_id);
        if (rowErr) throw rowErr;
      }
      toast.success("Valor atualizado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
      void load();
    } finally {
      setSavingRubricId(null);
      setEditingRubricId(null);
    }
  };

  
  const { toast: shadToast } = useToast();
  const editLock = usePayrollLock(refYear, refMonth);
  const isFromCalc = !!meta && String(meta.id).startsWith("calculated-");
  const allOk = rows.length > 0 && rows.every((r) => okIds.has(r.id));

  const toggleOk = (id: string) => {
    if (isLocked) { toast.error("Folha consolidada/aprovada — somente leitura"); return; }
    setOkIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const markOkAndAdvance = (id: string) => {
    if (isLocked) { toast.error("Folha consolidada/aprovada — somente leitura"); return; }
    setOkIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Fecha atual e abre o próximo colaborador ainda não OK
    const idx = rows.findIndex((r) => r.id === id);
    let nextId: string | null = null;
    for (let i = 1; i <= rows.length; i++) {
      const cand = rows[(idx + i) % rows.length];
      if (!cand) break;
      if (cand.id !== id && !okIds.has(cand.id)) { nextId = cand.id; break; }
    }
    setExpanded(nextId);
  };

  const handleRemove = async (id: string, name: string) => {
    if (isLocked) { toast.error("Folha consolidada/aprovada — não é possível remover colaboradores"); return; }
    if (!confirm(`Remover ${name} da folha?`)) return;
    setRemovingId(id);
    try {
      const table = isFromCalc ? "payroll_calculated" : "payroll_import_rows";
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
      setOkIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Colaborador removido da folha");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover");
    } finally {
      setRemovingId(null);
    }
  };

  const handleConferido = () => {
    toast.success(`Folha conferida — ${rows.length} colaborador(es) OK`);
  };

  // Sincroniza OK do painel simples com o estado do PayrollSummaryPanel oculto
  // (que renderiza o botão "Conferido" no header via portal)
  useEffect(() => {
    try {
      const key = `payroll_approved_${refYear}_${refMonth}`;
      localStorage.setItem(key, JSON.stringify(Array.from(okIds)));
      window.dispatchEvent(new CustomEvent("payroll:approved-sync", { detail: { year: refYear, month: refMonth } }));
    } catch {}
    window.dispatchEvent(
      new CustomEvent("payroll:ok-progress", {
        detail: { ok: okIds.size, total: rows.length, allOk: allOk },
      })
    );
  }, [okIds, rows.length, allOk, refYear, refMonth]);

  // Notifica a página do mês de referência atual
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("payroll:ref-change", { detail: { year: refYear, month: refMonth } }));
  }, [refYear, refMonth]);

  // Header dispara payroll:conferido
  useEffect(() => {
    const h = () => handleConferido();
    window.addEventListener("payroll:conferido", h);
    return () => window.removeEventListener("payroll:conferido", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  // Recarrega quando o painel oculto altera o status (envio à contabilidade, aprovação, consolidação)
  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener("payroll:status-changed", reload);
    return () => window.removeEventListener("payroll:status-changed", reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refYear, refMonth]);

  const isSentToAccounting = !!meta?.sent_to_accounting_at;
  const isAccountingOk = !!meta?.accounting_ok_at;
  const isConsolidated = !!meta?.consolidated_at;
  const awaitingAccounting = isSentToAccounting && !isAccountingOk;
  const isLocked = isAccountingOk || isConsolidated;

  const goPrev = () =>
    setRef(refMonth === 1 ? { year: refYear - 1, month: 12 } : { year: refYear, month: refMonth - 1 });
  const goNext = () => {
    if (isAtMax) return;
    setRef(refMonth === 12 ? { year: refYear + 1, month: 1 } : { year: refYear, month: refMonth + 1 });
  };
  const goCurrent = () => setRef(defaultRef());

  const load = async () => {
    setLoading(true);
    try {
      const { data: imp } = await (supabase as any)
        .from("payroll_imports")
        .select("id, ref_year, ref_month, sent_to_accounting_at, accounting_ok_at, consolidated_at")
        .eq("ref_year", refYear)
        .eq("ref_month", refMonth)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Quando há import real, conta linhas. Se 0 → folha é calculada (import é só marcador de workflow).
      let importRowCount = 0;
      if (imp) {
        const { count } = await (supabase as any)
          .from("payroll_import_rows")
          .select("id", { count: "exact", head: true })
          .eq("import_id", imp.id);
        importRowCount = Number(count ?? 0);
      }

      const useCalculated = !imp || importRowCount === 0;

      if (useCalculated) {
        const { data: calc } = await (supabase as any)
          .from("payroll_calculated")
          .select(`
            id, employee_id, worked_days,
            base_salary, proportional_salary,
            advance, food_voucher, transport_discount, health_plan,
            inss, irrf, fgts, productivity, family_allowance,
            infraction_discount, absence_discount, dsr_loss_discount, other_earnings, other_discounts,
            total_earnings, total_discounts, net_pay, calculation_details,
            employees:employee_id ( full_name, cpf, registration_number, position, admission_date, contract_type, esocial_category )
          `)
          .eq("reference_year", refYear)
          .eq("reference_month", refMonth);
        const list = ((calc ?? []) as any[]).filter((r) => !isInternshipEmployee(r.employees));
        if (list.length === 0) {
          setMeta(imp ? (imp as ImportMeta) : null);
          setRows([]); setRubricsByRow({}); return;
        }
        // Usa workflow do import real se existir; senão pseudo-meta
        setMeta(imp
          ? (imp as ImportMeta)
          : { id: `calculated-${refYear}-${refMonth}`, ref_year: refYear, ref_month: refMonth, sent_to_accounting_at: null, accounting_ok_at: null });
        setRows(list.map((r) => ({
          id: r.id,
          employee_id: r.employee_id ?? null,
          full_name: r.employees?.full_name ?? null,
          cpf: r.employees?.cpf ?? null,
          registration_number: r.employees?.registration_number ?? null,
          position: r.employees?.position ?? null,
          salary: Number(r.base_salary ?? r.proportional_salary ?? 0),
          total_earnings: Number(r.total_earnings ?? 0),
          total_discounts: Number(r.total_discounts ?? 0),
          net_amount: Number(r.net_pay ?? 0),
          worked_days: r.worked_days != null ? Number(r.worked_days) : null,
          admission_date: r.employees?.admission_date ?? null,
        })).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
        const synth: Record<string, RubricRow[]> = {};
        list.forEach((r) => {
          const rubs: RubricRow[] = [];
          const push = (description: string, kind: "earning" | "deduction", value: number) => {
            if (Number(value) === 0) return;
            rubs.push({ id: `${r.id}-${description}`, row_id: r.id, code: null, description, kind, value: Number(value) });
          };
          push("Salário proporcional", "earning", Number(r.proportional_salary ?? r.base_salary ?? 0));
          push("Produtividade 5%", "earning", Number(r.productivity ?? 0));
          push("Adicional Noturno", "earning", Number(r.calculation_details?.night_addition ?? 0));
          push("Feriados Trabalhados", "earning", Number(r.calculation_details?.holiday_pay ?? 0));
          push("Salário Família", "earning", Number(r.family_allowance ?? 0));
          push("Outros proventos", "earning", Number(r.other_earnings ?? 0));
          push("Adiantamentos", "deduction", Number(r.advance ?? 0));
          push("Vale-transporte", "deduction", Number(r.transport_discount ?? 0));
          push("Plano de saúde", "deduction", Number(r.health_plan ?? 0));
          push("INSS", "deduction", Number(r.inss ?? 0));
          push("IRRF", "deduction", Number(r.irrf ?? 0));
          push("Infrações", "deduction", Number(r.infraction_discount ?? 0));
          push("Faltas", "deduction", Number(r.absence_discount ?? r.calculation_details?.absence_discount ?? 0));
          push("DSR Falta", "deduction", Number(r.dsr_loss_discount ?? r.calculation_details?.dsr_loss_discount ?? 0));
          push("Outros descontos", "deduction", Number(r.other_discounts ?? 0));
          synth[r.id] = rubs;
        });
        setRubricsByRow(synth);
        return;
      }
      setMeta(imp as ImportMeta);
      const { data: rs } = await (supabase as any)
        .from("payroll_import_rows")
        .select("id, employee_id, full_name, cpf, registration_number, position, salary, total_earnings, total_discounts, net_amount")
        .eq("import_id", imp.id)
        .order("full_name", { ascending: true });
      setRows((rs as ImportRow[]) ?? []);
      if (rs && rs.length > 0) {
        const { data: rubs } = await (supabase as any)
          .from("payroll_import_rubrics")
          .select("id, row_id, code, description, kind, value")
          .in("row_id", (rs as any[]).map((r) => r.id));
        const grp: Record<string, RubricRow[]> = {};
        (rubs ?? []).forEach((rb: any) => {
          (grp[rb.row_id] ??= []).push({ ...rb, value: Number(rb.value) });
        });
        setRubricsByRow(grp);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [refYear, refMonth]);

  const totals = useMemo(() => {
    const e = rows.reduce((s, r) => s + Number(r.total_earnings || 0), 0);
    const d = rows.reduce((s, r) => s + Number(r.total_discounts || 0), 0);
    const n = rows.reduce((s, r) => s + Number(r.net_amount || 0), 0);
    return { e, d, n };
  }, [rows]);

  return (
    <div className="space-y-4">
      {editLock.blockedByOther && editLock.lock && (
        <div className="rounded-md border border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm flex flex-col gap-2 sm:flex-row sm:items-center">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1">
            <strong>{editLock.lock.user_name ?? "Outro usuário"}</strong> está editando esta folha agora.
            Você está em modo <strong>somente leitura</strong> até a sessão ser liberada.
          </span>
          <Button
            size="sm"
            variant="outline"
            data-lock-bypass
            onClick={async () => {
              if (!confirm("Assumir o controle? O outro usuário perderá a edição.")) return;
              const ok = await editLock.acquire(true);
              if (ok) shadToast({ title: "Controle assumido" });
              else shadToast({ title: "Não foi possível assumir", variant: "destructive" });
            }}
          >
            Assumir controle
          </Button>
        </div>
      )}
      {awaitingAccounting && (
        <div className="rounded-md border border-blue-500/60 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-blue-600 shrink-0 animate-pulse" />
          <span className="flex-1">
            <strong>Aguardando revisão contábil</strong> — folha enviada em{" "}
            {meta?.sent_to_accounting_at ? new Date(meta.sent_to_accounting_at).toLocaleString("pt-BR") : "—"}.
            A consolidação será liberada após a aprovação da contabilidade.
          </span>
        </div>
      )}
      {isAccountingOk && (
        <div className="rounded-md border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="flex-1">
            <strong>Folha aprovada pela contabilidade</strong> em{" "}
            {meta?.accounting_ok_at ? new Date(meta.accounting_ok_at).toLocaleString("pt-BR") : "—"}.
            Pronta para consolidar.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Mês de referência
        </Label>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={goPrev} className="h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="capitalize text-sm font-medium min-w-[160px] text-center px-2">
            {fmtMonth(refYear, refMonth)}
            {isAtDefault && <span className="ml-1 text-primary text-xs normal-case">(atual)</span>}
          </span>
          <Button variant="outline" size="icon" onClick={goNext} disabled={isAtMax} className="h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isAtDefault && (
            <Button variant="ghost" size="sm" onClick={goCurrent} className="text-xs h-9">Atual</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !meta ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma folha gerada para {fmtMonth(refYear, refMonth)}.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {rows.length} colaborador(es) · Líquido total: <strong>{money(totals.n)}</strong>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead className="text-center">Dias</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                    <TableHead className="w-[1%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const isOpen = expanded === r.id;
                    const rubs = rubricsByRow[r.id] ?? [];
                    const isOk = okIds.has(r.id);
                    return (
                      <>
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer ${isOk ? "bg-green-50 dark:bg-green-950/30" : idx % 2 === 1 ? "bg-muted/40" : ""} hover:bg-muted/60`}
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          <TableCell>
                            <div className="font-medium">{r.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.position ?? "—"} · CPF {r.cpf ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-xs font-mono whitespace-nowrap">{fmtWorkedDays(r.worked_days, refYear, refMonth, r.admission_date)}</div>
                          </TableCell>
                          <TableCell className="text-right">{money(r.total_earnings)}</TableCell>
                          <TableCell className="text-right text-destructive">{money(r.total_discounts)}</TableCell>
                          <TableCell className="text-right font-semibold">{money(r.net_amount)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {isOk && (
                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                                  <Check className="h-3.5 w-3.5" /> OK
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRemove(r.id, r.full_name ?? "")}
                                disabled={removingId === r.id || isLocked}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title={isLocked ? "Folha consolidada — não é possível remover" : "Remover"}
                                aria-label="Remover"
                              >
                                {removingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ChevronRightIcon className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${r.id}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <div className="rounded border bg-card my-2">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Descrição</TableHead>
                                      <TableHead>Tipo</TableHead>
                                      <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {rubs.length === 0 ? (
                                      <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-3">Sem rubricas</TableCell></TableRow>
                                    ) : rubs.map((rb) => (
                                      <TableRow key={rb.id}>
                                        <TableCell className="text-xs">{rb.description ?? "—"}</TableCell>
                                        <TableCell>
                                          <Badge variant={rb.kind === "deduction" ? "destructive" : rb.kind === "informative" ? "secondary" : "default"} className="text-xs">
                                            {rb.kind === "earning" ? "Provento" : rb.kind === "deduction" ? "Desconto" : "Informativo"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                          {rb.kind === "informative" || isLocked ? (
                                            <span className={isLocked ? "" : "text-muted-foreground"}>{money(rb.value)}</span>
                                          ) : editingRubricId === rb.id ? (
                                            <div className="flex items-center justify-end gap-1">
                                              <Input
                                                autoFocus
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={() => saveRubric(rb)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                                  if (e.key === "Escape") { setEditingRubricId(null); }
                                                }}
                                                className="h-7 w-28 text-right text-sm"
                                                inputMode="decimal"
                                              />
                                              {savingRubricId === rb.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => startEditRubric(rb)}
                                              className="hover:bg-accent rounded px-2 py-0.5 transition-colors"
                                              title="Clique para editar"
                                            >
                                              {money(rb.value)}
                                            </button>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                <div className="flex items-center justify-end gap-2 p-2 border-t flex-wrap">
                                  {isOk ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => toggleOk(r.id)}
                                      disabled={isLocked}
                                      className="h-8 gap-1"
                                      title={isLocked ? "Folha consolidada — somente leitura" : ""}
                                    >
                                      Desmarcar OK
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => markOkAndAdvance(r.id)}
                                      disabled={isLocked}
                                      className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white"
                                      title={isLocked ? "Folha consolidada — somente leitura" : ""}
                                    >
                                      <Check className="h-4 w-4" />
                                      OK — conferir próximo
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
