import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Loader2, Pencil, Trash2, CheckCircle2, X, Megaphone, Users, Copy, Globe,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { sortStores } from "@/lib/storeSort";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type JobStatus = "open" | "filled" | "completed" | "cancelled";
type Job = {
  id: string;
  store_id: string | null;
  title: string;
  description: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  amount: number;
  status: JobStatus;
  filled_freelancer_id: string | null;
  filled_at: string | null;
  completed_at: string | null;
  payment_id: string | null;
  stores?: { name: string } | null;
  filled_freelancer?: { id: string; full_name: string; pix_key: string | null; pix_key_type: string | null } | null;
};
type Application = {
  id: string;
  job_id: string;
  freelancer_id: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  notes: string | null;
  created_at: string;
  freelancers?: { full_name: string; phone: string | null } | null;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  open: "Aberta", filled: "Preenchida", completed: "Concluída", cancelled: "Cancelada",
};

// Tons usados em badges/legenda — todos via tokens do design system
const STATUS_BADGE: Record<JobStatus, string> = {
  open: "bg-primary text-primary-foreground border-transparent",
  filled: "bg-muted text-muted-foreground border-border",
  completed: "bg-success text-success-foreground border-transparent",
  cancelled: "bg-destructive text-destructive-foreground border-transparent",
};
const STATUS_DOT: Record<JobStatus, string> = {
  open: "bg-primary",
  filled: "bg-muted-foreground",
  completed: "bg-success",
  cancelled: "bg-destructive",
};

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtTime = (s: string | null | undefined) => (s ? s.slice(0,5) : "");

// ─── Helpers de semana (segunda → domingo) ──────────────────────────────────
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const startOfWeek = (d: Date) => {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay(); // 0=dom, 1=seg, ..., 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow; // segunda como início
  x.setDate(x.getDate() + diff);
  return x;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sameISO = (d: Date) => toISO(d);

const DAYS_PT = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
const DAYS_PT_SHORT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

// Mapa nome da loja → token de cor do design system
const normalizeStoreKey = (name: string) => {
  const n = name.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("AGUAS CLARAS")) return "aguas-claras";
  if (n.includes("ASA NORTE")) return "asa-norte";
  if (n.includes("ASA SUL")) return "asa-sul";
  if (n.includes("LAGO SUL")) return "lago-sul";
  return null;
};
const storeCellClasses = (name: string) => {
  const k = normalizeStoreKey(name);
  switch (k) {
    case "aguas-claras": return "bg-store-aguas-claras text-store-aguas-claras-foreground";
    case "asa-norte":    return "bg-store-asa-norte text-store-asa-norte-foreground";
    case "asa-sul":      return "bg-store-asa-sul text-store-asa-sul-foreground";
    case "lago-sul":     return "bg-store-lago-sul text-store-lago-sul-foreground";
    default:             return "bg-muted text-muted-foreground";
  }
};

export default function FreelancerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Record<string, Application[]>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  // dialog de criar/editar vaga
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // detalhe da vaga ao clicar no card do calendário
  const [detailId, setDetailId] = useState<string | null>(null);

  // filtros
  const [statusFilter, setStatusFilter] = useState<JobStatus>("open");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));

  const todayISO = () => toISO(new Date());
  const empty = { store_id: "", title: "Diária", description: "", work_date: todayISO(), start_time: "", end_time: "", amount: "" };
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    setLoading(true);
    const [{ data: j, error }, { data: st }] = await Promise.all([
      supabase.from("freelancer_job_openings")
        .select("*, stores(name), filled_freelancer:freelancers!freelancer_job_openings_filled_freelancer_id_fkey(id, full_name, pix_key, pix_key_type)")
        .order("work_date", { ascending: false }),
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
    ]);
    if (error) toast.error(error.message);
    setJobs((j ?? []) as Job[]);
    setStores(sortStores((st ?? []) as Store[]));

    const ids = (j ?? []).map((x: any) => x.id);
    if (ids.length) {
      const { data: ap } = await supabase
        .from("freelancer_job_applications")
        .select("*, freelancers(full_name, phone)")
        .in("job_id", ids)
        .order("created_at", { ascending: true });
      const byJob: Record<string, Application[]> = {};
      ((ap ?? []) as Application[]).forEach((a) => { (byJob[a.job_id] ??= []).push(a); });
      setApps(byJob);
    } else setApps({});
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setForm({ ...empty }); };
  const openNew = (prefill?: Partial<typeof empty>) => {
    reset();
    setForm((s) => ({ ...s, ...(prefill ?? {}) }));
    setOpen(true);
  };
  const openEdit = (j: Job) => {
    setEditingId(j.id);
    setForm({
      store_id: j.store_id ?? "", title: j.title, description: j.description ?? "",
      work_date: j.work_date, start_time: j.start_time ?? "", end_time: j.end_time ?? "",
      amount: String(j.amount),
    });
    setOpen(true);
  };

  const save = async () => {
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.title.trim()) { toast.error("Título obrigatório."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Valor inválido."); return; }
    setSaving(true);
    const payload = {
      store_id: form.store_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      work_date: form.work_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      amount,
    };
    const { error } = editingId
      ? await supabase.from("freelancer_job_openings").update(payload).eq("id", editingId)
      : await supabase.from("freelancer_job_openings").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Vaga atualizada." : "Vaga divulgada!");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta vaga?")) return;
    const { error } = await supabase.from("freelancer_job_openings").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDetailId(null);
    load();
  };

  const cancel = async (j: Job) => {
    if (!confirm("Cancelar esta vaga?")) return;
    const { error } = await supabase.from("freelancer_job_openings").update({ status: "cancelled" }).eq("id", j.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const approve = async (j: Job, a: Application) => {
    if (!confirm(`Aprovar ${a.freelancers?.full_name} para esta vaga? Isso já gera a diária pendente em Pagamentos.`)) return;
    const { error: e1 } = await supabase
      .from("freelancer_job_applications")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", a.id);
    if (e1) { toast.error(e1.message); return; }
    const otherIds = (apps[j.id] ?? []).filter((x) => x.id !== a.id && x.status === "pending").map((x) => x.id);
    if (otherIds.length) {
      await supabase.from("freelancer_job_applications").update({ status: "rejected", decided_at: new Date().toISOString() }).in("id", otherIds);
    }
    const { error: e2 } = await supabase
      .from("freelancer_job_openings")
      .update({
        status: "filled",
        filled_freelancer_id: a.freelancer_id,
        filled_at: new Date().toISOString(),
      })
      .eq("id", j.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Candidato aprovado.");
    load();
  };

  const reject = async (a: Application) => {
    const { error } = await supabase
      .from("freelancer_job_applications")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const concluir = async (j: Job) => {
    if (!j.filled_freelancer_id) { toast.error("Sem freelancer aprovado."); return; }
    if (!confirm("Confirmar que a diária foi cumprida?")) return;
    let paymentId = j.payment_id;
    if (!paymentId) {
      const { data: pay, error: e1 } = await supabase
        .from("freelancer_daily_payments")
        .insert({
          freelancer_id: j.filled_freelancer_id,
          store_id: j.store_id,
          work_date: j.work_date,
          amount: j.amount,
          notes: `Vaga: ${j.title}`,
        })
        .select("id").single();
      if (e1) { toast.error(e1.message); return; }
      paymentId = pay!.id;
    }
    const { error: e2 } = await supabase
      .from("freelancer_job_openings")
      .update({ status: "completed", completed_at: new Date().toISOString(), payment_id: paymentId })
      .eq("id", j.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Diária concluída.");
    load();
  };

  // Vagas da semana × loja, filtradas por status
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const cellJobs = (storeId: string, day: Date) => {
    const iso = sameISO(day);
    return jobs.filter((j) => j.store_id === storeId && j.work_date === iso && j.status === statusFilter);
  };

  const isThisWeek = useMemo(() => sameISO(startOfWeek(new Date())) === sameISO(weekStart), [weekStart]);

  const PUBLIC_BASE = "https://nexasuite.aquelaparme.com.br";
  const publicUrl = `${PUBLIC_BASE}/freelancer/login`;
  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!", { description: publicUrl });
  };

  const detail = detailId ? jobs.find((j) => j.id === detailId) ?? null : null;
  const detailApps = detail ? (apps[detail.id] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Vagas de diária
          </h1>
          <p className="text-muted-foreground text-sm">Divulgue diárias para os freelancers cadastrados se candidatarem.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyPublicLink} className="gap-2">
            <Copy className="h-4 w-4" />Copiar link público
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={publicUrl} target="_blank" rel="noopener"><Globe className="h-4 w-4" />Ver página pública</a>
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button onClick={() => openNew()} className="gap-1">
                <Plus className="h-4 w-4" /> Nova vaga
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Editar vaga" : "Nova vaga de diária"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Título *</Label>
                  <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Ex: Auxiliar de cozinha — sábado" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Loja</Label>
                    <Select value={form.store_id} onValueChange={(v) => setForm((s) => ({ ...s, store_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Data *</Label>
                    <Input type="date" value={form.work_date} onChange={(e) => setForm((s) => ({ ...s, work_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Início</Label>
                    <Input type="time" value={form.start_time} onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fim</Label>
                    <Input type="time" value={form.end_time} onChange={(e) => setForm((s) => ({ ...s, end_time: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Valor da diária (R$) *</Label>
                  <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Descrição / atividades</Label>
                  <Textarea rows={3} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Card principal: navegador semanal + abas + grid */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Linha de controles: setas + intervalo + status pills */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                {fmtDateBR(toISO(weekStart))} – {fmtDateBR(toISO(weekEnd))}
                {isThisWeek && <span className="ml-2 text-muted-foreground font-normal">Esta semana</span>}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isThisWeek && (
                <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs">
                  Hoje
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 justify-center md:justify-end">
              {(Object.keys(STATUS_LABEL) as JobStatus[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                  className="h-8"
                >
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* DESKTOP: grade Loja × Dia */}
              <div className="hidden md:block overflow-x-auto -mx-1">
                <div className="min-w-[900px] px-1">
                  {/* header */}
                  <div className="grid border border-border rounded-t-md overflow-hidden" style={{ gridTemplateColumns: "120px repeat(7, minmax(0, 1fr))" }}>
                    <div className="bg-muted text-muted-foreground text-xs font-semibold text-center py-2 border-r border-border">Loja</div>
                    {weekDays.map((d, i) => (
                      <div key={i} className={cn("bg-muted text-center py-2 text-xs font-semibold border-r border-border last:border-r-0", sameISO(d) === sameISO(new Date()) && "text-primary")}>
                        <div>{DAYS_PT[i]}</div>
                        <div className="text-muted-foreground font-normal">{fmtDateBR(toISO(d)).slice(0,5)}</div>
                      </div>
                    ))}
                  </div>
                  {/* rows */}
                  <div className="border-l border-r border-b border-border rounded-b-md overflow-hidden">
                    {stores.map((s, rowIdx) => (
                      <div key={s.id} className={cn("grid", rowIdx > 0 && "border-t border-border")} style={{ gridTemplateColumns: "120px repeat(7, minmax(0, 1fr))" }}>
                        <div className={cn("flex items-center justify-center text-center font-semibold text-xs px-2 py-3 border-r border-border", storeCellClasses(s.name))}>
                          {s.name.toUpperCase()}
                        </div>
                        {weekDays.map((d, i) => {
                          const list = cellJobs(s.id, d);
                          return (
                            <button
                              type="button"
                              key={i}
                              onClick={() => {
                                if (list.length === 0) openNew({ store_id: s.id, work_date: toISO(d) });
                              }}
                              className={cn(
                                "text-left p-1.5 min-h-[80px] border-r border-border last:border-r-0 space-y-1 transition-colors",
                                list.length === 0 ? "hover:bg-muted/40 cursor-pointer" : "bg-card",
                              )}
                            >
                              {list.map((j) => (
                                <div
                                  key={j.id}
                                  onClick={(e) => { e.stopPropagation(); setDetailId(j.id); }}
                                  className="rounded-md border border-border bg-background hover:border-primary/60 hover:shadow-sm transition-all p-1.5 cursor-pointer"
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="text-xs font-semibold">{fmtMoney(Number(j.amount))}</div>
                                    <Badge className={cn("text-[9px] px-1 py-0 h-4 font-medium", STATUS_BADGE[j.status])}>
                                      {STATUS_LABEL[j.status]}
                                    </Badge>
                                  </div>
                                  {(j.start_time || j.end_time) && (
                                    <div className="text-[10px] text-muted-foreground">{fmtTime(j.start_time)}{j.end_time ? `–${fmtTime(j.end_time)}` : ""}</div>
                                  )}
                                  {j.filled_freelancer?.full_name && (
                                    <div className="text-[10px] font-semibold uppercase truncate mt-0.5">{j.filled_freelancer.full_name}</div>
                                  )}
                                </div>
                              ))}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* MOBILE: cards empilhados por loja */}
              <div className="md:hidden space-y-3">
                {stores.map((s) => {
                  const weekJobs = weekDays.flatMap((d) => cellJobs(s.id, d).map((j) => ({ j, d })));
                  return (
                    <div key={s.id} className="border border-border rounded-md overflow-hidden">
                      <div className={cn("px-3 py-2 font-semibold text-xs", storeCellClasses(s.name))}>
                        {s.name.toUpperCase()}
                      </div>
                      <div className="p-2 space-y-2 bg-card">
                        {weekJobs.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => openNew({ store_id: s.id, work_date: toISO(weekStart) })}
                            className="w-full text-center text-xs text-muted-foreground italic py-3 hover:bg-muted/40 rounded"
                          >
                            Sem vagas {STATUS_LABEL[statusFilter].toLowerCase()} nesta semana — toque para criar
                          </button>
                        ) : weekJobs.map(({ j, d }, idx) => (
                          <div
                            key={idx}
                            onClick={() => setDetailId(j.id)}
                            className="rounded-md border border-border p-2 cursor-pointer hover:border-primary/60"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">{DAYS_PT_SHORT[(d.getDay()+6)%7]} {fmtDateBR(toISO(d)).slice(0,5)}</div>
                              <Badge className={cn("text-[9px] px-1 py-0 h-4", STATUS_BADGE[j.status])}>
                                {STATUS_LABEL[j.status]}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="font-semibold">{fmtMoney(Number(j.amount))}</div>
                              {(j.start_time || j.end_time) && (
                                <div className="text-[10px] text-muted-foreground">{fmtTime(j.start_time)}{j.end_time ? `–${fmtTime(j.end_time)}` : ""}</div>
                              )}
                            </div>
                            {j.filled_freelancer?.full_name && (
                              <div className="text-[10px] font-semibold uppercase truncate mt-0.5">{j.filled_freelancer.full_name}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Legenda */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {(Object.keys(STATUS_LABEL) as JobStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[s])} />
                  <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground">Clique em uma vaga para editar.</div>
          </div>
        </CardContent>
      </Card>

      {/* Detalhe da vaga */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.title}
                  <Badge className={cn("text-[10px]", STATUS_BADGE[detail.status])}>{STATUS_LABEL[detail.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-xs text-muted-foreground">Loja</div><div className="font-medium">{detail.stores?.name ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Data</div><div className="font-medium">{fmtDateBR(detail.work_date)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Horário</div><div className="font-medium">{fmtTime(detail.start_time) || "—"}{detail.end_time ? `–${fmtTime(detail.end_time)}` : ""}</div></div>
                  <div><div className="text-xs text-muted-foreground">Valor</div><div className="font-bold text-primary">{fmtMoney(Number(detail.amount))}</div></div>
                </div>
                {detail.description && (
                  <div>
                    <div className="text-xs text-muted-foreground">Descrição</div>
                    <div className="text-sm">{detail.description}</div>
                  </div>
                )}

                {detail.status === "open" && (
                  <div className="border-t pt-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Users className="h-3 w-3" /> Candidatos ({detailApps.length})
                    </div>
                    {detailApps.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Sem candidatos ainda.</div>
                    ) : (
                      <ul className="space-y-1">
                        {detailApps.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                            <div>
                              <span className="font-medium">{a.freelancers?.full_name}</span>
                              {a.freelancers?.phone && <span className="text-xs text-muted-foreground ml-2">{a.freelancers.phone}</span>}
                              {a.status !== "pending" && <Badge variant="outline" className="ml-2 text-[10px]">{a.status}</Badge>}
                            </div>
                            {a.status === "pending" && (
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => approve(detail, a)}><CheckCircle2 className="h-3 w-3 mr-1" />Aprovar</Button>
                                <Button size="sm" variant="outline" onClick={() => reject(a)}><X className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {detail.status === "filled" && detail.filled_freelancer && (
                  <div className="border-t pt-3 flex items-center justify-between gap-2">
                    <div className="text-sm">Aprovado: <span className="font-medium">{detail.filled_freelancer.full_name}</span></div>
                    <Button size="sm" onClick={() => concluir(detail)}><CheckCircle2 className="h-4 w-4 mr-1" />Concluir</Button>
                  </div>
                )}

                {detail.status === "completed" && (
                  <div className="border-t pt-3 text-xs text-muted-foreground">
                    Concluída — pagamento em <a href="/diarias-freelancers" className="text-primary hover:underline">Diárias de freelancers</a>.
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 flex-wrap">
                {(detail.status === "open" || detail.status === "filled") && (
                  <Button size="sm" variant="outline" onClick={() => cancel(detail)}>Cancelar vaga</Button>
                )}
                {detail.status !== "completed" && (
                  <Button size="sm" variant="outline" onClick={() => { openEdit(detail); setDetailId(null); }}>
                    <Pencil className="h-3 w-3 mr-1" />Editar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => remove(detail.id)}>
                  <Trash2 className="h-3 w-3 mr-1" />Excluir
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
