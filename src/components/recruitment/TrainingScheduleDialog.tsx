import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, CalendarRange, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onSaved?: () => void;
}

interface DayRow {
  id?: string;
  day_date: string;
  start_time: string;
  end_time: string;
  break_start: string;
  break_end: string;
  is_day_off: boolean;
  notes: string;
}

interface StoreOpt { id: string; name: string }
interface EmpOpt { id: string; full_name: string }

const emptyDay = (date: string): DayRow => ({
  day_date: date,
  start_time: "08:00",
  end_time: "17:00",
  break_start: "12:00",
  break_end: "13:00",
  is_day_off: false,
  notes: "",
});

export default function TrainingScheduleDialog({ open, onClose, employeeId, employeeName, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [location, setLocation] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [responsibleName, setResponsibleName] = useState("");
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<DayRow[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [employees, setEmployees] = useState<EmpOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: existing }, { data: storesData }, { data: empData }] = await Promise.all([
        supabase
          .from("training_schedules")
          .select("*, training_schedule_days(*)")
          .eq("employee_id", employeeId)
          .maybeSingle(),
        supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
        supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
      ]);
      setStores((storesData ?? []) as StoreOpt[]);
      setEmployees((empData ?? []) as EmpOpt[]);

      if (existing) {
        setScheduleId(existing.id);
        setStartDate(existing.start_date);
        setLocation(existing.location ?? "");
        setStoreId(existing.store_id ?? "");
        setResponsibleName(existing.responsible_name ?? "");
        setResponsibleEmployeeId(existing.responsible_employee_id ?? "");
        setNotes(existing.notes ?? "");
        const ds = ((existing as any).training_schedule_days ?? []) as any[];
        ds.sort((a, b) => a.day_date.localeCompare(b.day_date));
        setDays(
          ds.map((d) => ({
            id: d.id,
            day_date: d.day_date,
            start_time: d.start_time?.slice(0, 5) ?? "08:00",
            end_time: d.end_time?.slice(0, 5) ?? "17:00",
            break_start: d.break_start?.slice(0, 5) ?? "",
            break_end: d.break_end?.slice(0, 5) ?? "",
            is_day_off: !!d.is_day_off,
            notes: d.notes ?? "",
          })),
        );
      } else {
        setScheduleId(null);
        const today = format(new Date(), "yyyy-MM-dd");
        setStartDate(today);
        setLocation("");
        setStoreId("");
        setResponsibleName("");
        setResponsibleEmployeeId("");
        setNotes("");
        // pré-preenche 5 dias a partir de hoje
        setDays(Array.from({ length: 5 }, (_, i) => emptyDay(format(addDays(new Date(), i), "yyyy-MM-dd"))));
      }
      setLoading(false);
    })();
  }, [open, employeeId]);

  // Quando muda a data de início e ainda não temos schedule, recalcula 5 dias
  useEffect(() => {
    if (scheduleId) return;
    if (!startDate) return;
    const base = new Date(startDate + "T00:00:00");
    setDays(Array.from({ length: 5 }, (_, i) => emptyDay(format(addDays(base, i), "yyyy-MM-dd"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  const addDay = () => {
    const last = days[days.length - 1];
    const next = last ? addDays(new Date(last.day_date + "T00:00:00"), 1) : new Date();
    setDays([...days, emptyDay(format(next, "yyyy-MM-dd"))]);
  };

  const removeDay = (idx: number) => setDays(days.filter((_, i) => i !== idx));

  const updateDay = (idx: number, patch: Partial<DayRow>) => {
    setDays(days.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const canSave = useMemo(
    () => !!startDate && !!responsibleName.trim() && days.length > 0,
    [startDate, responsibleName, days],
  );

  const save = async () => {
    if (!canSave) {
      toast.error("Preencha data de início, responsável e ao menos 1 dia");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employee_id: employeeId,
        start_date: startDate,
        location: location.trim() || null,
        store_id: storeId || null,
        responsible_name: responsibleName.trim(),
        responsible_employee_id: responsibleEmployeeId || null,
        notes: notes.trim() || null,
      };

      let sid = scheduleId;
      if (sid) {
        const { error } = await supabase.from("training_schedules").update(payload).eq("id", sid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("training_schedules").insert(payload).select("id").single();
        if (error) throw error;
        sid = data.id;
        setScheduleId(sid);
      }

      // Substitui dias: deleta e reinsere (simples e consistente)
      await supabase.from("training_schedule_days").delete().eq("schedule_id", sid);
      const dayRows = days.map((d) => ({
        schedule_id: sid,
        day_date: d.day_date,
        start_time: d.is_day_off ? null : d.start_time || null,
        end_time: d.is_day_off ? null : d.end_time || null,
        break_start: d.is_day_off ? null : d.break_start || null,
        break_end: d.is_day_off ? null : d.break_end || null,
        is_day_off: d.is_day_off,
        notes: d.notes.trim() || null,
      }));
      if (dayRows.length > 0) {
        const { error } = await supabase.from("training_schedule_days").insert(dayRows);
        if (error) throw error;
      }

      // Atualiza employees.training_start_date se ainda vazio
      await supabase
        .from("employees")
        .update({ training_start_date: startDate })
        .eq("id", employeeId);

      // Envia email automático ao candidato com os detalhes do agendamento
      try {
        const { data: cand } = await supabase
          .from("job_candidates")
          .select("id, full_name, email, job_opening_id")
          .eq("created_employee_id", employeeId)
          .maybeSingle();
        if (cand?.email) {
          let jobTitle: string | undefined;
          if (cand.job_opening_id) {
            const { data: job } = await supabase
              .from("job_openings")
              .select("title")
              .eq("id", cand.job_opening_id)
              .maybeSingle();
            jobTitle = job?.title ?? undefined;
          }
          const storeName = stores.find((s) => s.id === storeId)?.name;
          const locationName = [location.trim(), storeName].filter(Boolean).join(" — ") || undefined;
          const fmtDate = (iso: string) => {
            try {
              return format(new Date(iso + "T00:00:00"), "EEEE, dd/MM/yyyy");
            } catch { return iso; }
          };
          const fmtShort = (iso: string) => {
            try {
              return format(new Date(iso + "T00:00:00"), "EEE, dd/MM");
            } catch { return iso; }
          };
          const daysPayload = days.map((d) => ({
            day_date: fmtShort(d.day_date),
            is_day_off: d.is_day_off,
            start_time: d.is_day_off ? null : d.start_time || null,
            end_time: d.is_day_off ? null : d.end_time || null,
            break_start: d.is_day_off ? null : d.break_start || null,
            break_end: d.is_day_off ? null : d.break_end || null,
            notes: d.notes?.trim() || null,
          }));

          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "training-scheduled",
              recipientEmail: cand.email,
              idempotencyKey: `training-scheduled-${sid}-${startDate}`,
              templateData: {
                name: cand.full_name?.split(" ")[0],
                jobTitle,
                startDate: fmtDate(startDate),
                locationName,
                responsibleName: responsibleName.trim() || undefined,
                notes: notes.trim() || undefined,
                days: daysPayload,
              },
            },
          });
        }
      } catch (mailErr) {
        console.warn("Falha ao enviar email de treinamento agendado:", mailErr);
      }

      toast.success("Treinamento agendado");
      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Falha ao agendar treinamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Agendar treinamento — {employeeName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de início *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Loja</Label>
                <Select value={storeId || "none"} onValueChange={(v) => setStoreId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Local do treinamento</Label>
                <Input placeholder="Ex.: Loja Asa Sul - cozinha" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável (nome) *</Label>
                <Input placeholder="Nome do responsável" value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável (colaborador)</Label>
                <Select
                  value={responsibleEmployeeId || "none"}
                  onValueChange={(v) => {
                    if (v === "none") { setResponsibleEmployeeId(""); return; }
                    setResponsibleEmployeeId(v);
                    const emp = employees.find((e) => e.id === v);
                    if (emp && !responsibleName.trim()) setResponsibleName(emp.full_name);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Vincular colaborador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm">Escala diária</h4>
                <Button size="sm" variant="outline" onClick={addDay} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Adicionar dia
                </Button>
              </div>

              <div className="space-y-2">
                {days.map((d, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          className="w-auto"
                          value={d.day_date}
                          onChange={(e) => updateDay(i, { day_date: e.target.value })}
                        />
                        <label className="flex items-center gap-1.5 text-xs">
                          <Switch checked={d.is_day_off} onCheckedChange={(v) => updateDay(i, { is_day_off: v })} />
                          Folga
                        </label>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeDay(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {!d.is_day_off && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Entrada</Label>
                          <Input type="time" value={d.start_time} onChange={(e) => updateDay(i, { start_time: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Início intervalo</Label>
                          <Input type="time" value={d.break_start} onChange={(e) => updateDay(i, { break_start: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fim intervalo</Label>
                          <Input type="time" value={d.break_end} onChange={(e) => updateDay(i, { break_end: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Saída</Label>
                          <Input type="time" value={d.end_time} onChange={(e) => updateDay(i, { end_time: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {days.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum dia adicionado.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading || !canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {scheduleId ? "Atualizar agendamento" : "Agendar treinamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
