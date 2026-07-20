import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Brain, AlertTriangle, CheckCircle2, Loader2, Users, TrendingDown } from "lucide-react";

interface Alert {
  id: string;
  employee_id: string;
  rule: string;
  status: string;
  triggered_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  employee?: { full_name: string; store?: { name: string } | null };
}

interface StoreAgg {
  store_id: string | null;
  store_name: string | null;
  week_start: string;
  respondents: number;
  avg_mood: number | null;
  low_count: number;
  skipped_count: number;
}

const ruleLabel = (r: string) =>
  r === "3_consecutive_low" ? "3 semanas seguidas ruins"
  : r === "4_of_6_low" ? "4 das últimas 6 semanas ruins"
  : r;

const statusLabel = (s: string) =>
  s === "open" ? "Aberto" : s === "in_progress" ? "Em atendimento" : s === "resolved" ? "Resolvido" : s;

const statusColor = (s: string) =>
  s === "open" ? "destructive" : s === "in_progress" ? "default" : "secondary";

export default function MentalHealth({ embedded = false }: { embedded?: boolean } = {}) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [agg, setAgg] = useState<StoreAgg[]>([]);
  const [allStores, setAllStores] = useState<{ id: string; name: string }[]>([]);
  const [participants30d, setParticipants30d] = useState<number>(0);
  const [cellDetail, setCellDetail] = useState<{ storeName: string; week: string; loading: boolean; rows: { name: string; score: number | null; skipped: boolean; comment: string | null }[] } | null>(null);

  const openCellDetail = async (storeId: string, storeName: string, week: string) => {
    setCellDetail({ storeName, week, loading: true, rows: [] });
    const weekEnd = new Date(week + "T00:00:00");
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const [{ data: checkins }, { data: scheds }] = await Promise.all([
      supabase
        .from("mood_checkins")
        .select("employee_id, mood_score, skipped, comment, employee:employees!mood_checkins_employee_id_fkey(full_name, store_id)")
        .eq("week_start", week),
      supabase
        .from("work_schedules")
        .select("employee_id, store_id")
        .gte("schedule_date", week)
        .lt("schedule_date", weekEndStr)
        .eq("is_day_off", false),
    ]);
    // effective store per employee that week
    const counts = new Map<string, Map<string, number>>();
    (scheds ?? []).forEach((s: any) => {
      if (!s.employee_id || !s.store_id) return;
      if (!counts.has(s.employee_id)) counts.set(s.employee_id, new Map());
      const m = counts.get(s.employee_id)!;
      m.set(s.store_id, (m.get(s.store_id) ?? 0) + 1);
    });
    const effectiveStore = (empId: string, fallback: string | null) => {
      const m = counts.get(empId);
      if (!m || m.size === 0) return fallback;
      let best: [string, number] | null = null;
      m.forEach((n, sid) => { if (!best || n > best[1]) best = [sid, n]; });
      return best ? best[0] : fallback;
    };
    const rows = (checkins ?? [])
      .filter((c: any) => effectiveStore(c.employee_id, c.employee?.store_id ?? null) === storeId)
      .map((c: any) => ({
        name: c.employee?.full_name ?? "—",
        score: c.skipped ? null : c.mood_score,
        skipped: !!c.skipped,
        comment: c.comment ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setCellDetail({ storeName, week, loading: false, rows });
  };

  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [followupType, setFollowupType] = useState("conversa_rh");
  const [followupNotes, setFollowupNotes] = useState("");
  const [newStatus, setNewStatus] = useState<string>("in_progress");
  const [savingFu, setSavingFu] = useState(false);

  const load = async () => {
    setLoading(true);
    const d30ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: al }, { data: ag }, { data: recentMood }, { data: st }] = await Promise.all([
      supabase
        .from("mental_health_alerts")
        .select("*, employee:employees!mental_health_alerts_employee_id_fkey(full_name, store:stores!employees_store_id_fkey(name))")
        .order("triggered_at", { ascending: false })
        .limit(200),
      supabase
        .from("v_mood_weekly_store_agg")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(200),
      supabase
        .from("mood_checkins")
        .select("employee_id")
        .eq("skipped", false)
        .gte("created_at", d30ago)
        .limit(5000),
      supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .not("name", "ilike", "%estoque central%")
        .order("name"),

    ]);
    setAlerts((al ?? []) as any);
    setAgg((ag ?? []) as any);
    setAllStores((st ?? []) as any);
    const distinct = new Set(((recentMood ?? []) as { employee_id: string }[]).map(r => r.employee_id));
    setParticipants30d(distinct.size);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAlerts = alerts.filter((a) => a.status !== "resolved");
  const weeks = useMemo(() => {
    const set = new Set(agg.map((a) => a.week_start));
    return Array.from(set).sort().reverse().slice(0, 6);
  }, [agg]);
  const stores = useMemo(() => {
    const map = new Map<string, string>();
    allStores.forEach((s) => map.set(s.id, s.name));
    agg.forEach((a) => { if (a.store_id && !map.has(a.store_id)) map.set(a.store_id, a.store_name || "—"); });
    return Array.from(map.entries())
      .filter(([, name]) => !/estoque central/i.test(name))
      .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [agg, allStores]);


  const cellFor = (storeId: string, week: string) =>
    agg.find((a) => a.store_id === storeId && a.week_start === week);

  const submitFollowup = async () => {
    if (!activeAlert) return;
    setSavingFu(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error: fuErr } = await supabase.from("mental_health_followups").insert({
        alert_id: activeAlert.id,
        employee_id: activeAlert.employee_id,
        type: followupType,
        notes: followupNotes || null,
        created_by: u.user?.id ?? null,
      });
      if (fuErr) throw fuErr;
      const updates: any = { status: newStatus };
      if (newStatus === "resolved") {
        updates.resolved_at = new Date().toISOString();
        updates.resolution_notes = followupNotes || null;
      }
      const { error: upErr } = await supabase
        .from("mental_health_alerts")
        .update(updates)
        .eq("id", activeAlert.id);
      if (upErr) throw upErr;
      toast({ title: "Acompanhamento registrado" });
      setActiveAlert(null);
      setFollowupNotes("");
      setFollowupType("conversa_rh");
      setNewStatus("in_progress");
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingFu(false);
    }
  };

  const moodColor = (v: number | null) => {
    if (v == null) return "bg-muted text-muted-foreground";
    if (v <= 2) return "bg-red-100 text-red-800 border-red-300";
    if (v <= 3) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    if (v <= 4) return "bg-lime-100 text-lime-800 border-lime-300";
    return "bg-green-100 text-green-800 border-green-300";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Saúde Mental (NR-1)
          </h1>
          <p className="text-muted-foreground">Monitoramento anônimo por loja + acompanhamento confidencial de alertas.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Alertas abertos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{openAlerts.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Colaboradores participando (30d)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{participants30d}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Baixos esta semana</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{agg.filter(a => a.week_start === weeks[0]).reduce((s,a)=>s+(a.low_count||0),0)}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="heatmap">
        <TabsList>
          <TabsTrigger value="heatmap">Humor por loja</TabsTrigger>
          <TabsTrigger value="alerts">Alertas ({openAlerts.length})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-3 mt-4">
          {openAlerts.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum alerta aberto. 🎉</CardContent></Card>
          )}
          {openAlerts.map((a) => (
            <Card key={a.id} className="border-l-4 border-l-orange-500">
              <CardContent className="pt-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">{a.employee?.store?.name ?? "—"}</div>
                  <div className="text-sm mt-1">Regra: <strong>{ruleLabel(a.rule)}</strong></div>
                  <div className="text-xs text-muted-foreground">Aberto em {new Date(a.triggered_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColor(a.status) as any}>{statusLabel(a.status)}</Badge>
                  <Button size="sm" onClick={() => { setActiveAlert(a); setNewStatus(a.status === "open" ? "in_progress" : a.status); }}>
                    Registrar acompanhamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="heatmap" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Média de humor por loja (últimas 6 semanas)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Loja</th>
                    {weeks.map((w) => (
                      <th key={w} className="text-center px-2 py-2 whitespace-nowrap">
                        {new Date(w + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stores.map(([id, name]) => (
                    <tr key={id} className="border-b">
                      <td className="py-2 pr-4 font-medium">{name}</td>
                      {weeks.map((w) => {
                        const c = cellFor(id, w);
                        const v = c?.avg_mood ?? null;
                        return (
                          <td key={w} className="px-1 py-1 text-center">
                            <div className={`inline-flex flex-col items-center justify-center rounded border px-2 py-1 min-w-[52px] ${moodColor(v ? Number(v) : null)}`}>
                              <span className="font-semibold">{v != null ? Number(v).toFixed(1) : "—"}</span>
                              <span className="text-[10px] opacity-70">{c?.respondents ?? 0} resp.</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr><td colSpan={weeks.length + 1} className="py-6 text-center text-muted-foreground">Nenhum check-in registrado ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {alerts.filter(a => a.status === "resolved").length === 0 && (
            <Card><CardContent className="py-6 text-center text-muted-foreground">Nenhum alerta resolvido ainda.</CardContent></Card>
          )}
          {alerts.filter(a => a.status === "resolved").map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">Resolvido em {a.resolved_at ? new Date(a.resolved_at).toLocaleString("pt-BR") : "—"}</div>
                  {a.resolution_notes && <div className="text-sm mt-1">{a.resolution_notes}</div>}
                </div>
                <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Resolvido</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!activeAlert} onOpenChange={(v) => !v && setActiveAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar acompanhamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Colaborador</label>
              <div className="text-sm">{activeAlert?.employee?.full_name}</div>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={followupType} onValueChange={setFollowupType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversa_rh">Conversa com RH</SelectItem>
                  <SelectItem value="atendimento_psicologico">Atendimento psicológico</SelectItem>
                  <SelectItem value="encaminhamento_medico">Encaminhamento médico</SelectItem>
                  <SelectItem value="ajuste_jornada">Ajuste de jornada / função</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Anotações (confidencial)</label>
              <Textarea value={followupNotes} onChange={(e) => setFollowupNotes(e.target.value)} rows={4} />
            </div>
            <div>
              <label className="text-sm font-medium">Novo status do alerta</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">Em atendimento</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveAlert(null)}>Cancelar</Button>
            <Button onClick={submitFollowup} disabled={savingFu}>
              {savingFu && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
