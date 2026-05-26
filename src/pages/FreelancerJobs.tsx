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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Pencil, Trash2, CheckCircle2, X, Megaphone, MapPin, Calendar, Clock, Users, Copy, Globe } from "lucide-react";
import { sortStores } from "@/lib/storeSort";

type Store = { id: string; name: string };
type Job = {
  id: string;
  store_id: string | null;
  title: string;
  description: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  amount: number;
  status: "open" | "filled" | "completed" | "cancelled";
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

const STATUS_LABEL: Record<Job["status"], string> = {
  open: "Aberta", filled: "Preenchida", completed: "Concluída", cancelled: "Cancelada",
};
const STATUS_VARIANT: Record<Job["status"], "default" | "secondary" | "outline" | "destructive"> = {
  open: "default", filled: "secondary", completed: "outline", cancelled: "destructive",
};

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };

export default function FreelancerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Record<string, Application[]>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"open" | "filled" | "completed" | "all">("open");

  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
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
  const openNew = () => { reset(); setOpen(true); };
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
    // Recusar os demais
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
    toast.success("Candidato aprovado. A diária será lançada em Pagamentos quando você confirmar a conclusão.");
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
    // Se ainda não houver pagamento (vagas antigas), cria agora
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

  const filtered = useMemo(() => {
    if (tab === "all") return jobs;
    return jobs.filter((j) => j.status === tab);
  }, [jobs, tab]);

  const PUBLIC_BASE = "https://nexa.aquelaparme.com.br";
  const publicUrl = `${PUBLIC_BASE}/freelancer/login`;
  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!", { description: publicUrl });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-primary" /> Vagas de diária
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
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova vaga</Button></DialogTrigger>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="open">Abertas</TabsTrigger>
          <TabsTrigger value="filled">Preenchidas</TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-3 space-y-3">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma vaga.</CardContent></Card>
          ) : filtered.map((j) => {
            const list = apps[j.id] ?? [];
            const pendentes = list.filter((a) => a.status === "pending");
            return (
              <Card key={j.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{j.title}</h3>
                        <Badge variant={STATUS_VARIANT[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.stores?.name ?? "—"}</span>
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDateBR(j.work_date)}</span>
                        {(j.start_time || j.end_time) && (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{(j.start_time ?? "").slice(0,5)}{j.end_time ? `–${j.end_time.slice(0,5)}` : ""}</span>
                        )}
                      </div>
                      {j.description && <p className="text-sm text-muted-foreground">{j.description}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{fmtMoney(Number(j.amount))}</div>
                      <div className="text-[10px] text-muted-foreground">por diária</div>
                    </div>
                  </div>

                  {j.status === "open" && (
                    <div className="border-t pt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Candidatos ({list.length})
                      </div>
                      {list.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Sem candidatos ainda.</div>
                      ) : (
                        <ul className="space-y-1">
                          {list.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                              <div>
                                <span className="font-medium">{a.freelancers?.full_name}</span>
                                {a.freelancers?.phone && <span className="text-xs text-muted-foreground ml-2">{a.freelancers.phone}</span>}
                                {a.status !== "pending" && <Badge variant="outline" className="ml-2 text-[10px]">{a.status}</Badge>}
                              </div>
                              {a.status === "pending" && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="default" onClick={() => approve(j, a)}><CheckCircle2 className="h-3 w-3 mr-1" />Aprovar</Button>
                                  <Button size="sm" variant="outline" onClick={() => reject(a)}><X className="h-3 w-3" /></Button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {j.status === "filled" && j.filled_freelancer && (
                    <div className="border-t pt-3 flex items-center justify-between gap-2">
                      <div className="text-sm">Aprovado: <span className="font-medium">{j.filled_freelancer.full_name}</span></div>
                      <Button size="sm" onClick={() => concluir(j)}><CheckCircle2 className="h-4 w-4 mr-1" />Concluir e gerar pagamento</Button>
                    </div>
                  )}

                  {j.status === "completed" && (
                    <div className="border-t pt-3 text-xs text-muted-foreground">
                      Concluída — pagamento pendente em <a href="/diarias-freelancers" className="text-primary hover:underline">Diárias de freelancers</a>.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 justify-end">
                    {(j.status === "open" || j.status === "filled") && (
                      <Button size="sm" variant="outline" onClick={() => cancel(j)}>Cancelar vaga</Button>
                    )}
                    {j.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(j)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => remove(j.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
