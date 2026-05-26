import { useEffect, useMemo, useState } from "react";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Loader2, Calendar as CalendarIcon, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  employeeId: string;
  storeId: string;
  userId: string;
  fullName: string;
}

interface ScheduleCell {
  id: string;
  schedule_date: string;
  is_day_off: boolean;
  is_home_office: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface Colleague {
  id: string;
  full_name: string;
  user_id: string | null;
  position: string | null;
}

type SwapType = "reciprocal" | "coverage";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Aguardando colega", variant: "outline" },
  accepted: { label: "Aguardando gestor", variant: "secondary" },
  approved: { label: "Aprovada", variant: "default" },
  rejected: { label: "Rejeitada", variant: "destructive" },
};

/**
 * Cartão "Trocar plantão" exibido na área do colaborador.
 * Permite ao colaborador propor uma troca recíproca (ele assume o dia do colega
 * e o colega assume o dele) ou uma cobertura simples (colega cobre 1 dia dele).
 */
export default function ShiftSwapCard({ employeeId, storeId, userId, fullName }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [mySchedule, setMySchedule] = useState<ScheduleCell[]>([]);
  const [partnerSchedule, setPartnerSchedule] = useState<ScheduleCell[]>([]);
  const [swapType, setSwapType] = useState<SwapType>("reciprocal");
  const [partnerId, setPartnerId] = useState<string>("");
  const [myDate, setMyDate] = useState<string>("");
  const [partnerDate, setPartnerDate] = useState<string>("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState<any[]>([]);

  const refresh = async () => {
    const { data } = await supabase
      .from("shift_swap_requests")
      .select("id, status, swap_type, requester_date, partner_date, reason, rejection_reason, created_at, partner_employee_id, partner_response_note, requester_employee_id, partner:employees!shift_swap_requests_partner_employee_id_fkey(full_name), requester:employees!shift_swap_requests_requester_employee_id_fkey(full_name)")
      .or(`requester_user_id.eq.${userId},partner_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(10);
    setRequests(data ?? []);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`shift-swap-card-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadColleagues = async () => {
    // Permite trocar com colegas de qualquer loja (não só a do solicitante)
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, user_id, position, store:stores!employees_store_id_fkey(name)")
      .neq("id", employeeId)
      .eq("status", "active")
      .order("full_name");
    setColleagues((data ?? [])
      .filter((c: any) => !!c.user_id)
      .map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        user_id: c.user_id,
        position: c.position ? `${c.position}${c.store?.name ? ` · ${c.store.name}` : ""}` : (c.store?.name ?? null),
      })) as Colleague[]);
  };

  const loadSchedules = async () => {
    const start = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 60), "yyyy-MM-dd");
    const { data: mine } = await supabase
      .from("work_schedules")
      .select("id, schedule_date, is_day_off, is_home_office, start_time, end_time")
      .eq("employee_id", employeeId)
      .gte("schedule_date", start)
      .lte("schedule_date", end)
      .order("schedule_date");
    setMySchedule((mine ?? []) as ScheduleCell[]);
  };

  const loadPartnerSchedule = async (pid: string) => {
    const start = format(new Date(), "yyyy-MM-dd");
    const end = format(addDays(new Date(), 60), "yyyy-MM-dd");
    const { data } = await supabase
      .from("work_schedules")
      .select("id, schedule_date, is_day_off, is_home_office, start_time, end_time")
      .eq("employee_id", pid)
      .gte("schedule_date", start)
      .lte("schedule_date", end)
      .order("schedule_date");
    setPartnerSchedule((data ?? []) as ScheduleCell[]);
  };

  const onOpen = async () => {
    setOpen(true);
    await Promise.all([loadColleagues(), loadSchedules()]);
  };

  const onSelectPartner = async (pid: string) => {
    setPartnerId(pid);
    setPartnerDate("");
    await loadPartnerSchedule(pid);
  };

  const reset = () => {
    setOpen(false);
    setSwapType("reciprocal");
    setPartnerId("");
    setMyDate("");
    setPartnerDate("");
    setReason("");
    setPartnerSchedule([]);
  };

  const submit = async () => {
    if (!partnerId || !myDate) {
      toast.error("Selecione o colega e o seu dia");
      return;
    }
    if (swapType === "reciprocal" && !partnerDate) {
      toast.error("Selecione também o dia do colega");
      return;
    }
    const partner = colleagues.find((c) => c.id === partnerId);
    if (!partner?.user_id) {
      toast.error("Colega não tem login no sistema");
      return;
    }

    setSubmitting(true);
    const { data: created, error } = await supabase
      .from("shift_swap_requests")
      .insert({
        requester_employee_id: employeeId,
        requester_user_id: userId,
        partner_employee_id: partnerId,
        partner_user_id: partner.user_id,
        store_id: storeId,
        swap_type: swapType,
        requester_date: myDate,
        partner_date: swapType === "reciprocal" ? partnerDate : null,
        reason: reason.trim() || null,
        status: "pending",
      })
      .select("id")
      .single();
    setSubmitting(false);

    if (error || !created) {
      toast.error("Falha ao enviar solicitação");
      return;
    }

    // Notifica o colega convidado
    void supabase.functions.invoke("notify-user", {
      body: {
        user_id: partner.user_id,
        title: "Pedido de troca de plantão",
        message: `${fullName} pediu uma troca${swapType === "reciprocal" ? " recíproca" : " (cobertura)"} com você.`,
        url: "/area-colaborador",
        tag: `swap-${created.id}`,
      },
    });

    toast.success("Solicitação enviada ao colega");
    reset();
  };

  const partnerOptions = useMemo(
    () => colleagues.map((c) => ({ value: c.id, label: `${c.full_name}${c.position ? ` · ${c.position}` : ""}` })),
    [colleagues],
  );

  const formatCell = (c: ScheduleCell) => {
    const d = format(parseISO(c.schedule_date), "EEE dd/MM", { locale: ptBR });
    if (c.is_day_off) return `${d} — Folga`;
    if (c.is_home_office) return `${d} — Home office`;
    if (c.start_time && c.end_time) return `${d} — ${c.start_time.slice(0,5)}–${c.end_time.slice(0,5)}`;
    return `${d} — Trabalho`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><ArrowLeftRight className="h-5 w-5" />Trocar plantão</CardTitle>
            <CardDescription>Proponha uma troca de dia com qualquer colega ativo (mesma loja ou outra).</CardDescription>
          </div>
          <Button size="sm" onClick={onOpen} className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />
            Nova troca
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação recente.</p>
        ) : (
          requests.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
            const isMine = r.requester_employee_id === employeeId;
            const otherName = isMine ? r.partner?.full_name : r.requester?.full_name;
            return (
              <div key={r.id} className="rounded-md border border-border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">
                    {isMine ? "Você → " : "← "}
                    <span className="text-muted-foreground font-normal">{otherName ?? "Colega"}</span>
                  </p>
                  <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.swap_type === "reciprocal" ? "Recíproca" : "Cobertura"} ·
                  {" "}{format(parseISO(r.requester_date), "dd/MM", { locale: ptBR })}
                  {r.partner_date && (
                    <> ↔ {format(parseISO(r.partner_date), "dd/MM", { locale: ptBR })}</>
                  )}
                </p>
                {r.reason && <p className="text-xs text-foreground">{r.reason}</p>}
                {r.rejection_reason && (
                  <p className="text-xs text-destructive">Motivo: {r.rejection_reason}</p>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" />Solicitar troca de plantão</DialogTitle>
            <DialogDescription>
              O colega precisa aceitar e o gestor aprovar antes da escala ser ajustada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tipo de troca</Label>
              <RadioGroup value={swapType} onValueChange={(v) => setSwapType(v as SwapType)} className="grid gap-2">
                <Label htmlFor="swap-reciprocal" className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="reciprocal" id="swap-reciprocal" className="mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Recíproca (troca de dias)</p>
                    <p className="text-xs text-muted-foreground">Você assume o dia do colega e ele assume o seu.</p>
                  </div>
                </Label>
                <Label htmlFor="swap-coverage" className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="coverage" id="swap-coverage" className="mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Cobertura (1 dia)</p>
                    <p className="text-xs text-muted-foreground">O colega cobre o seu dia, sem troca de volta.</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Colega</Label>
              <Select value={partnerId} onValueChange={onSelectPartner}>
                <SelectTrigger><SelectValue placeholder="Escolha o colega" /></SelectTrigger>
                <SelectContent>
                  {partnerOptions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nenhum colega disponível para troca.
                    </div>
                  )}
                  {partnerOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Seu dia</Label>
                <Select value={myDate} onValueChange={setMyDate}>
                  <SelectTrigger><SelectValue placeholder="Escolha seu dia" /></SelectTrigger>
                  <SelectContent>
                    {mySchedule.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum dia na escala.</div>
                    )}
                    {mySchedule.map((c) => (
                      <SelectItem key={c.schedule_date} value={c.schedule_date}>
                        {formatCell(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {swapType === "reciprocal" && (
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Dia do colega</Label>
                  <Select value={partnerDate} onValueChange={setPartnerDate} disabled={!partnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder={partnerId ? "Escolha o dia do colega" : "Escolha um colega"} />
                    </SelectTrigger>
                    <SelectContent>
                      {partnerSchedule.length === 0 && partnerId && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum dia na escala do colega.</div>
                      )}
                      {partnerSchedule.map((c) => (
                        <SelectItem key={c.schedule_date} value={c.schedule_date}>
                          {formatCell(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explique brevemente o motivo da troca."
                className="min-h-[70px] text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={reset} disabled={submitting}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
