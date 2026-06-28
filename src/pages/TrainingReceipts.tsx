import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, BadgeCheck, Banknote, Download, Save, Trash2, CheckCircle2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { generateTrainingReceiptPdf } from "@/lib/trainingReceiptPdf";
import { exportC6PixFile } from "@/lib/c6Export";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// 5º dia útil de um (ano, mês 1-12) — mesma regra da folha
function fifthBusinessDay(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (count < 5) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    if (count < 5) d.setDate(d.getDate() + 1);
  }
  return d;
}

type Employee = {
  id: string;
  full_name: string;
  cpf: string | null;
  rg: string | null;
  position: string | null;
  salary: number | null;
  status: string | null;
  training_start_date: string | null;
  training_end_date: string | null;
  admission_date: string | null;
  store_id: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  stores?: { name: string | null } | null;
};

type ReceiptRow = {
  id: string;
  employee_id: string;
  training_start: string;
  training_end: string;
  worked_days: number;
  monthly_salary: number;
  daily_rate: number;
  total_amount: number;
  due_date: string;
  payable_id: string | null;
  payable_posted_at: string | null;
  c6_exported_at: string | null;
  signature_required_at: string | null;
  signed_at: string | null;
  created_at: string;
  employees?: {
    full_name: string;
    cpf: string | null;
    rg: string | null;
    position: string | null;
    pix_key: string | null;
    pix_key_type: string | null;
    store_id: string | null;
    stores?: { name: string | null } | null;
  } | null;
};

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function computeDays(start: string, end: string): number {
  if (!start || !end) return 0;
  try {
    const d = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    return Math.max(0, d);
  } catch { return 0; }
}

export default function TrainingReceipts() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const [trainingStart, setTrainingStart] = useState("");
  const [trainingEnd, setTrainingEnd] = useState("");
  const [workedDays, setWorkedDays] = useState("");
  const [salary, setSalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkPosting, setBulkPosting] = useState(false);
  const [bulkExporting, setBulkExporting] = useState(false);

  async function load() {
    setLoading(true);
    const [emp, rec] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, cpf, rg, position, salary, status, training_start_date, training_end_date, admission_date, store_id, pix_key, pix_key_type, stores:store_id(name)")
        .not("status", "eq", "terminated")
        .order("full_name"),
      (supabase as any)
        .from("training_receipts")
        .select("*, employees:employee_id(full_name, cpf, rg, position, pix_key, pix_key_type, store_id, stores:store_id(name))")
        .order("created_at", { ascending: false }),
    ]);
    if (emp.error) toast({ title: "Erro ao carregar colaboradores", description: emp.error.message, variant: "destructive" });
    else setEmployees((emp.data ?? []) as any);
    if (rec.error) toast({ title: "Erro ao carregar histórico", description: rec.error.message, variant: "destructive" });
    else setReceipts((rec.data ?? []) as any);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const target = useMemo(
    () => employees.find(e => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  useEffect(() => {
    if (!target) {
      setTrainingStart(""); setTrainingEnd(""); setWorkedDays(""); setSalary("");
      return;
    }
    const start = target.training_start_date ?? "";
    let end = target.training_end_date ?? "";
    if (target.admission_date && start) {
      const adm = parseISO(target.admission_date);
      const beforeAdm = new Date(adm); beforeAdm.setDate(beforeAdm.getDate() - 1);
      end = format(beforeAdm, "yyyy-MM-dd");
    }
    setTrainingStart(start);
    setTrainingEnd(end);
    setWorkedDays(String(computeDays(start, end)));
    setSalary(target.salary != null ? String(target.salary) : "");
  }, [target]);

  useEffect(() => {
    if (trainingStart && trainingEnd) {
      setWorkedDays(String(computeDays(trainingStart, trainingEnd)));
    }
  }, [trainingStart, trainingEnd]);

  const calc = useMemo(() => {
    const sal = Number(String(salary).replace(",", ".")) || 0;
    const days = Number(workedDays) || 0;
    const ref = trainingEnd ? parseISO(trainingEnd) : (trainingStart ? parseISO(trainingStart) : new Date());
    const daysInMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const daily = sal / daysInMonth;
    const total = +(daily * days).toFixed(2);
    return { sal, days, daily, total, daysInMonth };
  }, [salary, workedDays, trainingEnd, trainingStart]);

  const dueInfo = useMemo(() => {
    if (!trainingEnd) return null;
    const ref = parseISO(trainingEnd);
    const refY = ref.getFullYear();
    const refM = ref.getMonth() + 1;
    const payY = refM === 12 ? refY + 1 : refY;
    const payM = refM === 12 ? 1 : refM + 1;
    const due = fifthBusinessDay(payY, payM);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    return { date: due, iso };
  }, [trainingEnd]);

  function validate(): boolean {
    if (!target) { toast({ title: "Selecione um colaborador", variant: "destructive" }); return false; }
    if (!trainingStart || !trainingEnd) { toast({ title: "Informe início e fim do treinamento", variant: "destructive" }); return false; }
    if (calc.days <= 0) { toast({ title: "Dias trabalhados deve ser maior que zero", variant: "destructive" }); return false; }
    if (calc.sal <= 0) { toast({ title: "Salário inválido", variant: "destructive" }); return false; }
    return true;
  }

  async function handleSave() {
    if (!validate() || !target || !dueInfo) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("training_receipts")
        .insert({
          employee_id: target.id,
          training_start: trainingStart,
          training_end: trainingEnd,
          worked_days: calc.days,
          monthly_salary: calc.sal,
          daily_rate: +calc.daily.toFixed(2),
          total_amount: calc.total,
          due_date: dueInfo.iso,
          created_by: user?.id ?? null,
        });
      if (error) throw error;
      toast({ title: "Recibo salvo", description: `${target.full_name} · ${fmtBRL(calc.total)}` });
      setSelectedId("");
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf(r: ReceiptRow) {
    try {
      const doc = generateTrainingReceiptPdf({
        employee_name: r.employees?.full_name ?? "",
        employee_cpf: r.employees?.cpf ?? null,
        employee_rg: r.employees?.rg ?? null,
        position: r.employees?.position ?? null,
        store_name: r.employees?.stores?.name ?? null,
        training_start: r.training_start,
        training_end: r.training_end,
        worked_days: r.worked_days,
        monthly_salary: Number(r.monthly_salary),
        daily_rate: Number(r.daily_rate),
        total_amount: Number(r.total_amount),
      });
      const safeName = (r.employees?.full_name ?? "recibo").replace(/[^\w]+/g, "_");
      doc.save(`recibo-treinamento-${safeName}-${r.training_start}.pdf`);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function handleDelete(r: ReceiptRow) {
    if (!confirm("Excluir este recibo do histórico?")) return;
    const { error } = await (supabase as any).from("training_receipts").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Recibo excluído" });
    await load();
  }

  // Pendentes para ações globais
  const pendingPayable = useMemo(() => receipts.filter(r => !r.payable_posted_at), [receipts]);
  const pendingC6 = useMemo(() => receipts.filter(r => !r.c6_exported_at && !!r.employees?.pix_key), [receipts]);

  async function handleBulkPostPayable() {
    if (pendingPayable.length === 0) {
      toast({ title: "Nada a lançar", description: "Todos os recibos já foram lançados." });
      return;
    }
    setBulkPosting(true);
    try {
      // Buscar categoria 'Treinamento' (fallback 'Folha de pagamento')
      const { data: cat } = await (supabase as any)
        .from("finance_categories")
        .select("id")
        .ilike("name", "treinamento")
        .eq("kind", "expense")
        .eq("is_active", true)
        .maybeSingle();
      let categoryId = cat?.id ?? null;
      if (!categoryId) {
        const { data: fallback } = await (supabase as any)
          .from("finance_categories")
          .select("id")
          .ilike("name", "folha de pagamento")
          .eq("kind", "expense")
          .eq("is_active", true)
          .maybeSingle();
        categoryId = fallback?.id ?? null;
      }

      let ok = 0, fail = 0;
      for (const r of pendingPayable) {
        let storeId = r.employees?.store_id ?? null;
        if (!storeId && r.employees?.full_name) {
          const { data } = await (supabase as any).rpc("get_employee_cost_center_by_name", { _full_name: r.employees.full_name });
          storeId = (data as string | null) ?? null;
        }
        if (!storeId) { fail++; continue; }

        const { data: ap, error: apErr } = await (supabase as any)
          .from("accounts_payable")
          .insert({
            store_id: storeId,
            installment_number: 1,
            due_date: r.due_date,
            amount: Number(r.total_amount),
            beneficiary: r.employees?.full_name ?? "",
            supplier_name: r.employees?.full_name ?? "",
            description: `Recibo treinamento ${format(parseISO(r.training_start), "dd/MM/yyyy")} a ${format(parseISO(r.training_end), "dd/MM/yyyy")} · ${r.employees?.full_name ?? ""}`,
            category_id: categoryId,
            status: "pending",
            created_by: user?.id ?? null,
          })
          .select("id")
          .maybeSingle();
        if (apErr) { fail++; continue; }
        await (supabase as any)
          .from("training_receipts")
          .update({
            payable_id: ap?.id ?? null,
            payable_posted_at: new Date().toISOString(),
            signature_required_at: (r as any).signed_at ? null : new Date().toISOString(),
          })
          .eq("id", r.id);
        ok++;
      }
      toast({ title: "Lançamento concluído", description: `${ok} lançado(s)${fail ? ` · ${fail} falha(s) (sem loja)` : ""}` });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao lançar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBulkPosting(false);
    }
  }

  async function handleBulkExportC6() {
    if (pendingC6.length === 0) {
      toast({ title: "Nada a exportar", description: "Sem recibos pendentes com chave PIX." });
      return;
    }
    setBulkExporting(true);
    try {
      // Agrupa por data de vencimento (data de pagamento)
      const groups = new Map<string, ReceiptRow[]>();
      for (const r of pendingC6) {
        const arr = groups.get(r.due_date) ?? [];
        arr.push(r);
        groups.set(r.due_date, arr);
      }
      let totalIncluded = 0;
      for (const [due, rows] of groups) {
        const result = await exportC6PixFile({
          rows: rows.map(r => ({
            name: r.employees?.full_name ?? "",
            pixKey: r.employees?.pix_key ?? "",
            pixKeyType: r.employees?.pix_key_type ?? null,
            amount: Number(r.total_amount),
            employeeId: (r as any).employee_id ?? null,
          })),
          fileName: `c6-treinamento-${due}`,
          paymentDate: parseISO(due),
          source: "training",
          sourceRef: `Treinamento ${due}`,
        });
        totalIncluded += result.included;
        if (result.included > 0) {
          const ids = rows.map(r => r.id);
          await (supabase as any)
            .from("training_receipts")
            .update({ c6_exported_at: new Date().toISOString() })
            .in("id", ids);
        }
      }
      toast({
        title: "Exportação C6 concluída",
        description: `${totalIncluded} pagamento(s) incluído(s)`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao exportar C6", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBulkExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <BadgeCheck className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          Recibos de treinamento
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Selecione o colaborador, salve o recibo e use as ações globais para lançar e exportar.
        </p>
      </div>

      <div className="max-w-2xl w-full">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Colaborador</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um colaborador..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}{e.position ? ` — ${e.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {target && (
              <div className="space-y-3 border-t pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Início do treinamento</Label>
                    <Input type="date" value={trainingStart} onChange={(e) => setTrainingStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fim do treinamento</Label>
                    <Input type="date" value={trainingEnd} onChange={(e) => setTrainingEnd(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Dias trabalhados</Label>
                    <Input type="number" min={0} value={workedDays} onChange={(e) => setWorkedDays(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Salário mensal (R$)</Label>
                    <Input inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} />
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Diária (sal÷{calc.daysInMonth})</span><span>{fmtBRL(calc.daily || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dias × diária</span><span>{calc.days} × {fmtBRL(calc.daily || 0)}</span></div>
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Total a pagar</span><span className="text-emerald-600">{fmtBRL(calc.total || 0)}</span></div>
                  {dueInfo && (
                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                      <span>Vencimento (5º dia útil)</span>
                      <span>{format(dueInfo.date, "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}
                  {target && !target.pix_key && (
                    <div className="text-xs text-amber-600 pt-1">
                      ⚠ Sem chave PIX cadastrada — exportação C6 indisponível.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedId("")} disabled={saving}>
                    Limpar
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar recibo
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h2 className="text-base md:text-lg font-semibold">Histórico de recibos</h2>
              <p className="text-xs text-muted-foreground">
                {receipts.length} recibo(s) · {pendingPayable.length} pendente(s) p/ contas a pagar · {pendingC6.length} pendente(s) p/ C6
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkPostPayable}
                disabled={bulkPosting || pendingPayable.length === 0}
              >
                {bulkPosting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
                Lançar contas a pagar ({pendingPayable.length})
              </Button>
              <Button
                size="sm"
                onClick={handleBulkExportC6}
                disabled={bulkExporting || pendingC6.length === 0}
              >
                {bulkExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportar C6 PIX ({pendingC6.length})
              </Button>
            </div>
          </div>

          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum recibo salvo ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-md p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium flex flex-wrap items-center gap-2">
                      <span className="truncate">{r.employees?.full_name ?? "—"}</span>
                      {r.payable_posted_at && (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Lançado
                        </Badge>
                      )}
                      {r.c6_exported_at && (
                        <Badge variant="outline" className="text-blue-700 border-blue-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> C6 exportado
                        </Badge>
                      )}
                      {r.signed_at ? (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Assinado
                        </Badge>
                      ) : r.signature_required_at ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          Aguardando assinatura
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(r.training_start), "dd/MM/yyyy")} a {format(parseISO(r.training_end), "dd/MM/yyyy")} · {r.worked_days} dia(s) · venc. {format(parseISO(r.due_date), "dd/MM/yyyy")}
                    </div>
                    <div className="text-sm font-semibold text-emerald-600">
                      {fmtBRL(Number(r.total_amount))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => handleGeneratePdf(r)}>
                      <FileText className="h-4 w-4 mr-1" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
