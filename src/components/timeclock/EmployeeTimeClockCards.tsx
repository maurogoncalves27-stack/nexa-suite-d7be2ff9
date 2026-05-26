import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlarmClockOff, FileSignature, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { TimeClockEntryType, ENTRY_TYPE_LABEL } from "@/lib/timeClock";
import { buildTimesheetClosureDoc } from "@/lib/timesheetPdf";
import { buildEmployeeTimesheetRow } from "@/lib/employeeTimesheetRow";

interface Closure {
  id: string;
  reference_year: number;
  reference_month: number;
  status: "open" | "awaiting_acceptance" | "accepted" | "sent_to_accounting";
  summary: any;
  closed_at: string | null;
  accepted_at: string | null;
}

interface Props {
  employeeId: string;
}

const ENTRY_TYPES: TimeClockEntryType[] = [
  "clock_in", "break_start", "break_end", "break_start_2", "break_end_2", "clock_out",
];

function pad(n: number) { return n.toString().padStart(2, "0"); }

async function getClientIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const j = await res.json();
    return j.ip ?? null;
  } catch { return null; }
}

export function EmployeeTimeClockCards({ employeeId }: Props) {
  const { user } = useAuth();
  const [closure, setClosure] = useState<Closure | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form, setForm] = useState({
    reference_date: format(new Date(), "yyyy-MM-dd"),
    entry_type: "clock_in" as TimeClockEntryType,
    entry_time: "08:00",
    notes: "",
  });

  const load = async () => {
    const { data } = await supabase
      .from("timesheet_closures")
      .select("*")
      .eq("employee_id", employeeId)
      .in("status", ["awaiting_acceptance", "accepted", "sent_to_accounting"])
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    setClosure((data ?? null) as Closure | null);
  };

  useEffect(() => { load(); }, [employeeId]);

  const submitRequest = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const note = `Esquecimento de batida — ${ENTRY_TYPE_LABEL[form.entry_type]} ~${form.entry_time}.${form.notes ? " " + form.notes : ""}`;
      const { error } = await supabase.from("time_clock_justifications").insert({
        employee_id: employeeId,
        reference_date: form.reference_date,
        justification_type: "forgotten_punch",
        notes: note,
        requested_by_employee: true,
        status: "pending",
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Pedido enviado", description: "Aguarde a tratativa do gestor." });
      setRequestOpen(false);
      setForm({ reference_date: format(new Date(), "yyyy-MM-dd"), entry_type: "clock_in", entry_time: "08:00", notes: "" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const acceptClosure = async () => {
    if (!user || !closure) return;
    setAccepting(true);
    try {
      const ip = await getClientIp();
      const ua = navigator.userAgent;
      const { error } = await supabase
        .from("timesheet_closures")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_ip: ip,
          accepted_user_agent: ua,
        })
        .eq("id", closure.id);
      if (error) throw error;
      toast({ title: "Folha aceita", description: "Obrigado por confirmar suas horas." });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };

  const openPreview = async () => {
    if (!closure) return;
    setPreviewLoading(true);
    try {
      const row = await buildEmployeeTimesheetRow({
        employeeId,
        year: closure.reference_year,
        month: closure.reference_month,
        closureSummary: closure.summary,
        closureStatus: closure.status,
        closureAcceptedAt: closure.accepted_at,
      });
      if (!row) throw new Error("Não foi possível montar a folha");
      const doc = buildTimesheetClosureDoc({
        year: closure.reference_year,
        month: closure.reference_month,
        rows: [row],
      });
      const blob = doc.output("blob");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast({ title: "Erro ao abrir folha", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const monthLabel = closure
    ? format(new Date(closure.reference_year, closure.reference_month - 1, 1), "MMMM 'de' yyyy", { locale: ptBR })
    : "";
  const sum = closure?.summary ?? {};
  const hours = sum.worked_minutes ? `${Math.floor(sum.worked_minutes / 60)}h${pad(sum.worked_minutes % 60)}` : "—";

  return (
    <div className="space-y-3">
      {/* Aceite da folha do mês */}
      {closure && closure.status === "awaiting_acceptance" && (
        <Card id="timesheet-acceptance" className="border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              Folha de ponto — {monthLabel}
            </CardTitle>
            <CardDescription>Confira sua folha completa e confirme suas horas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border bg-background p-2">
                <div className="text-xs text-muted-foreground">Dias trabalhados</div>
                <div className="text-lg font-bold">{sum.worked_days ?? "—"}</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-xs text-muted-foreground">Horas</div>
                <div className="text-lg font-bold">{hours}</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-xs text-muted-foreground">Faltas</div>
                <div className="text-lg font-bold">{sum.absences ?? "—"}</div>
              </div>
            </div>
            <Button variant="outline" onClick={openPreview} disabled={previewLoading} className="w-full">
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Ver folha completa (batidas dia a dia)
            </Button>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, sua aceitação fica registrada com data, hora e IP — equivalente à assinatura eletrônica simples (Lei 14.063/2020).
            </p>
            <Button onClick={acceptClosure} disabled={accepting} className="w-full" size="lg">
              {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmo minhas horas
            </Button>
          </CardContent>
        </Card>
      )}

      {closure && closure.status !== "awaiting_acceptance" && (
        <Card className="border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            <span>Folha de {monthLabel}: <Badge variant="secondary">{closure.status === "accepted" ? "Aceita" : "Enviada à contabilidade"}</Badge></span>
            {closure.accepted_at && (
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(closure.accepted_at), "dd/MM HH:mm")}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Solicitar ajuste de batida */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlarmClockOff className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-sm">Esqueci de bater o ponto?</div>
              <div className="text-xs text-muted-foreground">Solicite ajuste ao gestor.</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>Solicitar</Button>
        </CardContent>
      </Card>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar ajuste de batida</DialogTitle>
            <DialogDescription>
              Informe a batida esquecida. Seu gestor receberá o pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.reference_date} onChange={(e) => setForm({ ...form, reference_date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.entry_type} onValueChange={(v) => setForm({ ...form, entry_type: v as TimeClockEntryType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((t) => <SelectItem key={t} value={t}>{ENTRY_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora aproximada</Label>
                <Input type="time" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: cheguei e esqueci de registrar a entrada" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancelar</Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 sm:p-6">
          <DialogHeader className="px-4 pt-4 sm:p-0">
            <DialogTitle>Folha de ponto — {monthLabel}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe src={previewUrl} className="w-full flex-1 rounded border" title="Folha de ponto" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EmployeeTimeClockCards;
