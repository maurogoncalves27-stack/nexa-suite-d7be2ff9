import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Bus, CreditCard, Smartphone, FileSpreadsheet, CheckCircle2, ChevronLeft, ChevronRight, Save, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { exportC6PixFile } from "@/lib/c6Export";

const VT_CATEGORY_ID = "23c0a507-f52d-46e5-aff3-c268a02b86df"; // Vale transporte

interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  salary: number | null;
  salary_type: string | null;
  monthly_hours: number | null;
  work_schedule: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  bank_name: string | null;
  store_id: string | null;
  contracting_store?: { name: string } | null;
}

/** Salário-base mensal considerando horistas (salary × monthly_hours). */
const monthlyBaseSalary = (e: { salary: number | null; salary_type: string | null; monthly_hours: number | null }) => {
  const s = Number(e.salary) || 0;
  if (e.salary_type === "horario" || e.salary_type === "hourly") {
    return s * (Number(e.monthly_hours) || 220);
  }
  return s;
};


type PaymentFrequency = "weekly" | "biweekly" | "monthly";
type PaymentMethod = "card" | "pix";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Cartão",
  pix: "PIX",
};

const FREQ_LABEL: Record<PaymentFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

// Dias úteis sugeridos por escala (média mensal)
const suggestedDaysForSchedule = (schedule: string | null | undefined): number => {
  const s = (schedule ?? "").trim().toLowerCase();
  if (s.includes("6x1")) return 26;
  if (s.includes("12x36")) return 15;
  if (s.includes("5x2")) return 22;
  return 22; // padrão
};

// % de desconto sugerido por escala
const suggestedDiscountForSchedule = (schedule: string | null | undefined): number => {
  const s = (schedule ?? "").trim().toLowerCase();
  if (s.includes("12x36")) return 3;
  return 6; // padrão CLT (máx)
};

const scheduleGroupLabel = (schedule: string | null | undefined): string => {
  const s = (schedule ?? "").trim().toLowerCase();
  if (!s) return "Sem jornada definida";
  if (s.includes("12x36")) return "Escala 12x36";
  if (s.includes("6x1")) return "Escala 6x1";
  if (s.includes("5x2")) return "Escala 5x2";
  return `Escala ${(schedule ?? "").trim()}`;
};

// Tom visual por tipo de escala (usa tokens do design system)
const scheduleTone = (label: string): { header: string; row: string } => {
  if (label.includes("12x36")) return { header: "bg-warning/15 hover:bg-warning/15", row: "border-l-2 border-l-warning" };
  if (label.includes("6x1")) return { header: "bg-accent/40 hover:bg-accent/40", row: "border-l-2 border-l-accent" };
  if (label.includes("5x2")) return { header: "bg-secondary/60 hover:bg-secondary/60", row: "border-l-2 border-l-secondary" };
  return { header: "bg-muted/40 hover:bg-muted/40", row: "border-l-2 border-l-muted" };
};

interface VTRow {
  employee_id: string;
  daily_value: number;
  working_days_per_month: number;
  discount_percent: number;
  notes: string | null;
  payment_method: PaymentMethod;
}

const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function TransportVoucherPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [vts, setVts] = useState<Record<string, VTRow>>({});
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>("biweekly");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [exporting, setExporting] = useState(false);
  const [launchingPayables, setLaunchingPayables] = useState(false);

  // Aprovação mensal — bloqueia geração de folha enquanto não aprovado
  const today = new Date();
  const initialMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const initialYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const [refMonth, setRefMonth] = useState<number>(initialMonth);
  const [refYear, setRefYear] = useState<number>(initialYear);
  const [approved, setApproved] = useState<boolean>(false);
  const [savingApproval, setSavingApproval] = useState(false);

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("payroll_vt_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle();
      if (!cancelled) setApproved(!!data);
    })();
    return () => { cancelled = true; };
  }, [refYear, refMonth]);

  const handleApprove = async () => {
    const saved = await saveAll({ silent: true, keepApproval: true });
    if (!saved) return;
    setSavingApproval(true);
    try {
      const { error } = await (supabase as any)
        .from("payroll_vt_review")
        .upsert({
          reference_year: refYear,
          reference_month: refMonth,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        }, { onConflict: "reference_year,reference_month" });
      if (error) throw error;
      setApproved(true);
      toast({ title: "VT aprovado", description: `Já é possível gerar a folha de ${MONTHS[refMonth - 1]}/${refYear}.` });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingApproval(false);
    }
  };

  const invalidateApproval = async () => {
    if (!approved) return;
    await (supabase as any)
      .from("payroll_vt_review")
      .delete()
      .eq("reference_year", refYear)
      .eq("reference_month", refMonth);
    setApproved(false);
  };

  const showRecalculatePayrollNotice = () => {
    toast({
      title: "Edição atualizada",
      description: "A aprovação do VT foi removida. Aprove novamente e gere nova folha para usar os valores atualizados.",
    });
  };

  const load = async () => {
    setLoading(true);
    const [{ data: emps, error: ee }, { data: rows, error: re }, { data: settings }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, salary, salary_type, monthly_hours, work_schedule, pix_key, pix_key_type, bank_name, store_id, contracting_store:stores!employees_store_id_fkey(name)")
        .eq("status", "active")
        .order("full_name"),
      supabase.from("employee_transport_vouchers").select("*"),
      (supabase as any).from("transport_voucher_settings").select("*").maybeSingle(),
    ]);
    if (ee) toast({ title: "Erro", description: ee.message, variant: "destructive" });
    if (re) toast({ title: "Erro", description: re.message, variant: "destructive" });
    const empList = (emps ?? []) as unknown as EmployeeRow[];
    setEmployees(empList);
    const map: Record<string, VTRow> = {};
    (rows ?? []).forEach((r: any) => {
      map[r.employee_id] = {
        employee_id: r.employee_id,
        daily_value: Number(r.daily_value),
        working_days_per_month: Number(r.working_days_per_month),
        discount_percent: Number(r.discount_percent),
        notes: r.notes,
        payment_method: (r.payment_method as PaymentMethod) ?? "card",
      };
    });
    setVts(map);
    if (settings) {
      setPaymentFrequency((settings.payment_frequency as PaymentFrequency) ?? "biweekly");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async (patch: { payment_frequency?: PaymentFrequency }) => {
    setSavingSettings(true);
    const { error } = await (supabase as any)
      .from("transport_voucher_settings")
      .upsert({
        id: true,
        payment_frequency: patch.payment_frequency ?? paymentFrequency,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      }, { onConflict: "id" });
    setSavingSettings(false);
    if (error) {
      toast({ title: "Erro ao salvar configuração", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const onChangeFrequency = async (v: PaymentFrequency) => {
    const prev = paymentFrequency;
    setPaymentFrequency(v);
    const ok = await saveSettings({ payment_frequency: v });
    if (!ok) setPaymentFrequency(prev);
  };

  const getRow = (emp: EmployeeRow): VTRow =>
    vts[emp.id] ?? {
      employee_id: emp.id,
      daily_value: 0,
      working_days_per_month: suggestedDaysForSchedule(emp.work_schedule),
      discount_percent: suggestedDiscountForSchedule(emp.work_schedule),
      notes: null,
      payment_method: "card",
    };

  const update = (emp: EmployeeRow, patch: Partial<VTRow>) => {
    setVts((prev) => ({ ...prev, [emp.id]: { ...getRow(emp), ...patch } }));
  };

  const save = async (emp: EmployeeRow) => {
    const wasApproved = approved;
    const r = getRow(emp);
    setSaving(emp.id);
    try {
      const { error } = await supabase
        .from("employee_transport_vouchers")
        .upsert({
          employee_id: emp.id,
          daily_value: r.daily_value,
          working_days_per_month: r.working_days_per_month,
          discount_percent: r.discount_percent,
          notes: r.notes,
          payment_method: r.payment_method,
        }, { onConflict: "employee_id" });
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      await invalidateApproval();
      if (wasApproved) {
        showRecalculatePayrollNotice();
        return;
      }
      toast({ title: "Salvo", description: "Vale transporte atualizado." });
    } finally {
      setSaving(null);
    }
  };

  const saveAll = async (options?: { silent?: boolean; keepApproval?: boolean }) => {
    const wasApproved = approved;
    setSaving("__all__");
    const payload = employees.map((e) => {
      const r = getRow(e);
      return {
        employee_id: e.id,
        daily_value: r.daily_value,
        working_days_per_month: r.working_days_per_month,
        discount_percent: r.discount_percent,
        notes: r.notes,
        payment_method: r.payment_method,
      };
    });
    try {
      const { error } = await supabase
        .from("employee_transport_vouchers")
        .upsert(payload, { onConflict: "employee_id" });
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return false;
      }
      if (!options?.keepApproval) await invalidateApproval();
      if (options?.silent) return true;
      if (wasApproved && !options?.keepApproval) {
        showRecalculatePayrollNotice();
        return true;
      }
      toast({ title: "Salvo", description: `${payload.length} colaborador(es) atualizado(s).` });
      return true;
    } finally {
      setSaving(null);
    }
  };

  const allRows = useMemo(() => employees.map((e) => {
    const r = getRow(e);
    const total = r.daily_value * r.working_days_per_month;
    // CLT: desconto é o MENOR entre % do salário e o custo do VT
    const percentDiscount = monthlyBaseSalary(e) * (r.discount_percent / 100);
    const discount = Math.min(percentDiscount, total);
    const employerCost = Math.max(0, total - discount);
    return { e, r, total, discount, employerCost };
  }), [employees, vts]);

  const rows = useMemo(
    () => methodFilter === "all" ? allRows : allRows.filter(x => x.r.payment_method === methodFilter),
    [allRows, methodFilter],
  );

  const groupedRows = useMemo(() => {
    const groups = new Map<string, typeof rows>();
    const order = ["Escala 12x36", "Escala 6x1", "Escala 5x2"];
    rows.forEach((row) => {
      const label = scheduleGroupLabel(row.e.work_schedule);
      if (!groups.has(label)) groups.set(label, [] as typeof rows);
      groups.get(label)!.push(row);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [rows]);

  const methodCounts = useMemo(() => ({
    card: allRows.filter(x => x.r.payment_method === "card").length,
    pix: allRows.filter(x => x.r.payment_method === "pix").length,
  }), [allRows]);

  const periodTotals = useMemo(() => rows.reduce(
    (acc, x) => ({
      total: acc.total + x.total,
      discount: acc.discount + x.discount,
      employerCost: acc.employerCost + x.employerCost,
      withVT: acc.withVT + (x.total > 0 ? 1 : 0),
    }),
    { total: 0, discount: 0, employerCost: 0, withVT: 0 },
  ), [rows]);

  const totalLabel = paymentFrequency === "monthly"
    ? "Total mensal"
    : `Total ${FREQ_LABEL[paymentFrequency].toLowerCase()}`;

  const exportTransportVoucher = async () => {
    // Exporta no template oficial do C6 (PIX por chave). Cartão e quem não tem chave PIX são ignorados.
    const candidates = rows.filter((x) => x.r.payment_method === "pix" && x.total > 0);
    if (candidates.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum colaborador com VT-PIX a pagar no período.", variant: "destructive" });
      return;
    }
    const semChave = candidates.filter((x) => !(x.e.pix_key ?? "").trim());
    if (semChave.length > 0) {
      const nomes = semChave.slice(0, 5).map((x) => x.e.full_name).join("\n- ");
      const ok = window.confirm(
        `${semChave.length} colaborador(es) sem chave PIX serão IGNORADOS na exportação:\n\n- ${nomes}${semChave.length > 5 ? "\n- ..." : ""}\n\nDeseja continuar?`
      );
      if (!ok) return;
    }

    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const periodoLabel = FREQ_LABEL[paymentFrequency].toLowerCase();
      const { included } = await exportC6PixFile({
        rows: candidates.map((x) => ({
          name: x.e.full_name,
          pixKey: x.e.pix_key ?? "",
          pixKeyType: x.e.pix_key_type ?? null,
          amount: x.total,
          description: `Vale Transporte ${periodoLabel}`,
        })),
        fileName: `c6-vale-transporte-${periodoLabel}-${today}`,
      });
      if (included === 0) {
        toast({ title: "Sem chaves PIX", description: "Nenhum colaborador VT-PIX tem chave PIX cadastrada.", variant: "destructive" });
        return;
      }
      toast({ title: "Planilha C6 gerada", description: `${included} pagamento(s) prontos para upload no C6.` });
    } catch (e: any) {
      toast({ title: "Falhou ao gerar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const launchPixPayables = async () => {
    const pixRows = allRows.filter(
      (x) => x.r.payment_method === "pix" && (x.e.pix_key ?? "").trim() !== "" && x.total > 0,
    );
    const skippedNoKey = allRows.filter(
      (x) => x.r.payment_method === "pix" && (x.e.pix_key ?? "").trim() === "" && x.total > 0,
    );
    if (pixRows.length === 0) {
      toast({
        title: "Nenhum colaborador elegível",
        description: "Não há colaboradores com forma PIX e chave PIX cadastrada.",
        variant: "destructive",
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("accounts_payable")
      .select("supplier_name")
      .eq("category_id", VT_CATEGORY_ID)
      .eq("due_date", today)
      .like("description", "VT %PIX%");

    const dupNames = new Set<string>();
    (existing ?? []).forEach((p: any) => {
      if (pixRows.some((x) => x.e.full_name === p.supplier_name)) dupNames.add(p.supplier_name);
    });

    let confirmMsg = `Lançar ${pixRows.length} pagamento(s) de VT-PIX no contas a pagar?\n\nVencimento: ${new Date().toLocaleDateString("pt-BR")} (hoje).`;
    if (dupNames.size > 0) {
      confirmMsg += `\n\n⚠️ Já existem ${dupNames.size} lançamento(s) de VT-PIX criado(s) hoje (serão duplicados):\n- ${Array.from(dupNames).slice(0, 5).join("\n- ")}${dupNames.size > 5 ? "\n- ..." : ""}`;
    }
    if (skippedNoKey.length > 0) {
      confirmMsg += `\n\n${skippedNoKey.length} colaborador(es) PIX serão IGNORADOS por não terem chave PIX cadastrada.`;
    }
    if (!window.confirm(confirmMsg)) return;

    setLaunchingPayables(true);
    try {
      if (!user?.id) {
        toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
        return;
      }

      // Centro de custo = loja alocada do colaborador (Fábrica como padrão)
      const resolvedStoreIds = await Promise.all(
        pixRows.map(async (x) => {
          const { data } = await (supabase as any).rpc("get_employee_cost_center_by_name", {
            _full_name: x.e.full_name,
          });
          return (data as string | null) ?? x.e.store_id ?? null;
        }),
      );

      const inserts = pixRows
        .map((x, i) => ({
          store_id: resolvedStoreIds[i],
          category_id: VT_CATEGORY_ID,
          supplier_name: x.e.full_name,
          description: `VT ${FREQ_LABEL[paymentFrequency]} - PIX`,
          amount: Number(x.total.toFixed(2)),
          due_date: today,
          status: "pending",
          installment_number: 1,
          created_by: user.id,
        }))
        .filter((r) => r.store_id);

      if (inserts.length === 0) {
        toast({
          title: "Sem loja vinculada",
          description: "Nenhum colaborador tem loja e nenhuma loja física padrão foi encontrada.",
          variant: "destructive",
        });
        return;
      }

      const { error: insErr } = await supabase.from("accounts_payable").insert(inserts as any);
      if (insErr) {
        toast({ title: "Falhou ao lançar contas a pagar", description: insErr.message, variant: "destructive" });
        return;
      }

      toast({
        title: "Lançado",
        description: `${inserts.length} lançamento(s) criado(s) no contas a pagar.`,
      });
    } finally {
      setLaunchingPayables(false);
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (employees.length === 0) {
    return <div className="text-center text-muted-foreground py-8">Nenhum colaborador ativo encontrado.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Aprovação mensal para liberar geração de folha */}
      <div className="rounded-md border bg-card p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bus className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Aprovação para folha</span>
          {approved && (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
              <CheckCircle2 className="h-3 w-3" /> Aprovado
            </Badge>
          )}
          {saving === "__all__" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
              {MONTHS[refMonth - 1]} {refYear}
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
          {!approved && (
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={savingApproval || saving === "__all__"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            >
              {savingApproval || saving === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar VT deste mês
            </Button>
          )}
          {approved && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => saveAll()}
              disabled={saving === "__all__"}
              className="gap-1"
            >
              {saving === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar edição
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card p-3 space-y-3">
        {/* Linha 1: Frequência */}
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Bus className="h-4 w-4 text-primary" />
            Frequência de pagamento (vale para todos)
            {savingSettings && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="sm:max-w-xs">
            <Select value={paymentFrequency} onValueChange={(v) => onChangeFrequency(v as PaymentFrequency)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="biweekly">Quinzenal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            A forma de pagamento (cartão ou PIX) é definida individualmente por colaborador.
          </p>
        </div>

        {/* Linha 2: Filtros à esquerda + ações à direita */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 pt-1 border-t">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground mr-1">Filtrar:</span>
            <Button
              size="sm" variant={methodFilter === "all" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setMethodFilter("all")}
            >
              Todos ({allRows.length})
            </Button>
            <Button
              size="sm" variant={methodFilter === "card" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setMethodFilter("card")}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1" /> Cartão ({methodCounts.card})
            </Button>
            <Button
              size="sm" variant={methodFilter === "pix" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setMethodFilter("pix")}
            >
              <Smartphone className="h-3.5 w-3.5 mr-1" /> PIX ({methodCounts.pix})
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 text-xs"
              onClick={exportTransportVoucher}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              )}
              Exportar para C6 (PIX)
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={launchPixPayables}
            >
              {launchingPayables ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              )}
              Lançar PIX a pagar
            </Button>
          </div>
        </div>

        {/* Linha 3: Totais destacados */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Colaboradores c/ VT</div>
            <div className="text-base font-bold text-foreground">{periodTotals.withVT}</div>
          </div>
          <div className="rounded-md bg-primary/10 px-3 py-2 col-span-1 sm:col-span-2">
            <div className="text-[11px] text-muted-foreground">{totalLabel}</div>
            <div className="text-base font-bold text-primary">{money(periodTotals.total)}</div>
          </div>
        </div>
      </div>

      <div className="md:hidden space-y-4">
        {groupedRows.map(([label, items]) => (
          <div key={label} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
              {label} <span className="text-muted-foreground/70">({items.length})</span>
            </div>
            {items.map(({ e, r, total }) => (
          <div key={e.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{e.full_name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Valor diário</Label>
                <Input
                  type="number" step="0.01" min="0"
                  className="h-8 text-right"
                  value={r.daily_value}
                  onChange={(ev) => update(e, { daily_value: Number(ev.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Dias úteis</Label>
                <Input
                  type="number" step="1" min="0" max="31"
                  className="h-8 text-right"
                  value={r.working_days_per_month}
                  onChange={(ev) => update(e, { working_days_per_month: Number(ev.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={r.payment_method} onValueChange={(v) => update(e, { payment_method: v as PaymentMethod })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">
                    <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Cartão</span>
                  </SelectItem>
                  <SelectItem value="pix">
                    <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> PIX</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs pt-1 border-t space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total VT:</span>
                <span className="font-medium">{money(total)}</span>
              </div>
              {(() => {
                const pct = Number(r.discount_percent) || 0;
                const maxLegal = monthlyBaseSalary(e) * (pct / 100);
                const payrollDiscount = Math.min(total, maxLegal);
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">% Desc.:</span>
                      <Input
                        type="number" step="0.01" min="0" max="100"
                        className="h-7 w-20 text-right text-xs"
                        value={r.discount_percent}
                        onChange={(ev) => update(e, { discount_percent: Number(ev.target.value) })}
                      />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Desc. folha:</span>
                      <span className="font-medium">{money(payrollDiscount)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
            {paymentFrequency !== "monthly" && total > 0 && (
              <div className="text-[11px] text-muted-foreground pt-1">
                Por repasse ({FREQ_LABEL[paymentFrequency].toLowerCase()}): <strong className="text-foreground">{money(total)}</strong>
              </div>
            )}
            <Button
              size="sm"
              variant={approved ? "secondary" : "outline"}
              className="w-full h-8 gap-1"
              onClick={() => save(e)}
              disabled={saving === e.id || saving === "__all__"}
            >
              {saving === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : approved ? <RefreshCw className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {approved ? "Atualizar edição" : "Salvar"}
            </Button>
          </div>
            ))}
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
      <Table className="w-auto">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[360px]">Colaborador</TableHead>
            <TableHead className="w-32 text-right">Valor diário</TableHead>
            <TableHead className="w-24 text-right">Dias úteis</TableHead>
            <TableHead className="w-32">Forma pgto.</TableHead>
            <TableHead className="w-32 text-right">Total VT</TableHead>
            <TableHead className="w-24 text-right" title="% do salário descontada em folha (6% padrão CLT, 3% para escala 12x36)">% Desc.</TableHead>
            <TableHead className="w-32 text-right" title="Valor descontado na folha = min(Total VT, salário × %)">Desc. folha</TableHead>
            <TableHead className="w-36 text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedRows.flatMap(([label, items]) => {
            const tone = scheduleTone(label);
            return [
            <TableRow key={`grp-${label}`} className={tone.header}>
              <TableCell colSpan={8} className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label} <span className="text-muted-foreground/70">({items.length})</span>
              </TableCell>
            </TableRow>,
            ...items.map(({ e, r, total }) => {
              const pct = Number(r.discount_percent) || 0;
              const maxLegal = monthlyBaseSalary(e) * (pct / 100);
              const payrollDiscount = Math.min(total, maxLegal);
              return (
            <TableRow key={e.id} className={tone.row}>
              <TableCell className="font-medium">{e.full_name}</TableCell>
              <TableCell>
                <Input
                  type="number" step="0.01" min="0"
                  className="h-8 text-right"
                  value={r.daily_value}
                  onChange={(ev) => update(e, { daily_value: Number(ev.target.value) })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number" step="1" min="0" max="31"
                  className="h-8 text-right"
                  value={r.working_days_per_month}
                  onChange={(ev) => update(e, { working_days_per_month: Number(ev.target.value) })}
                />
              </TableCell>
              <TableCell>
                <Select value={r.payment_method} onValueChange={(v) => update(e, { payment_method: v as PaymentMethod })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">
                      <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Cartão</span>
                    </SelectItem>
                    <SelectItem value="pix">
                      <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> PIX</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                {money(total)}
                {paymentFrequency !== "monthly" && total > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    {money(total)} / {FREQ_LABEL[paymentFrequency].toLowerCase()}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Input
                  type="number" step="0.01" min="0" max="100"
                  className="h-8 text-right"
                  value={r.discount_percent}
                  onChange={(ev) => update(e, { discount_percent: Number(ev.target.value) })}
                />
              </TableCell>
              <TableCell className="text-right font-medium">{money(payrollDiscount)}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant={approved ? "secondary" : "outline"}
                  className="h-8 px-2 text-xs gap-1"
                  onClick={() => save(e)}
                  disabled={saving === e.id || saving === "__all__"}
                >
                  {saving === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : approved ? <RefreshCw className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {approved ? "Atualizar edição" : "Salvar"}
                </Button>
              </TableCell>
            </TableRow>
              );
            }),
          ];
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
