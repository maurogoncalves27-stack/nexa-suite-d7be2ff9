import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ArrowLeft, BarChart3, Loader2, Siren, Sparkles, Lightbulb, AlertTriangle, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

interface AlertRow {
  id: string;
  occurrence_id: string;
  created_by: string;
  store_id: string | null;
  note: string | null;
  subcategory: string | null;
  created_at: string;
  occurrences?: { occurrence: string; category: string | null; order_correct: boolean } | null;
  stores?: { name: string | null } | null;
}

export default function OccurrencesReport() {
  const { isPartner, isAdmin, isManager, isSuperUser } = useAuth();
  const { mode: viewMode } = useViewMode();
  const readOnly = (viewMode === "socio" && (isPartner || isSuperUser)) || (isPartner && !isAdmin && !isManager);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string>("30");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all");
  const [reporterNames, setReporterNames] = useState<Record<string, string>>({});
  const [orphanAlerts, setOrphanAlerts] = useState<AlertRow[]>([]);
  const [realStores, setRealStores] = useState<{ id: string; name: string }[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiScope, setAiScope] = useState<string>("geral"); // 'geral' | nome da loja | 'comparativo'
  const [aiResult, setAiResult] = useState<{
    resumo?: string;
    loja_critica?: { nome: string; total: number; observacao: string };
    causas_principais?: { causa: string; ocorrencias: number; impacto: string }[];
    padroes?: string[];
    sugestoes?: { acao: string; responsavel: string; prazo: string; detalhe: string }[];
    impacto_ifood?: { percentual: number; total: number; observacao: string; acoes_mitigacao: string[] };
  } | null>(null);
  const [aiRanking, setAiRanking] = useState<{
    name: string; revenue: number; occurrences: number;
    occ_ifood: number; occ_interno: number;
    per_10k_total: number; per_10k_interno: number; per_10k_ifood: number;
  }[] | null>(null);

  const STORE_TABS: { key: string; label: string }[] = [
    { key: "ÁGUAS CLARAS", label: "Águas Claras" },
    { key: "ASA NORTE", label: "Asa Norte" },
    { key: "ASA SUL", label: "Asa Sul" },
    { key: "LAGO SUL", label: "Lago Sul" },
  ];


  const load = async () => {
    setLoading(true);
    const since = startOfDay(subDays(new Date(), Number(days))).toISOString();
    const { data, error } = await supabase
      .from("occurrence_alerts")
      .select(
        "id, occurrence_id, created_by, store_id, note, subcategory, created_at, occurrences(occurrence, category, order_correct), stores(name)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar relatório", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as AlertRow[];
    setAlerts(rows);

    const userIds = Array.from(new Set(rows.map((r) => r.created_by)));
    if (userIds.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const map: Record<string, string> = {};
      (emps ?? []).forEach((e) => {
        if (e.user_id) map[e.user_id] = e.full_name ?? "—";
      });
      setReporterNames(map);
    }
    setLoading(false);
  };

  const loadOrphans = async () => {
    const { data } = await supabase
      .from("occurrence_alerts")
      .select("id, occurrence_id, created_by, store_id, note, subcategory, created_at, occurrences(occurrence, category, order_correct), stores(name)")
      .is("store_id", null)
      .order("created_at", { ascending: false });
    const rows = ((data ?? []) as unknown) as AlertRow[];
    setOrphanAlerts(rows);
    const ids = Array.from(new Set(rows.map((r) => r.created_by)));
    if (ids.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("user_id, full_name")
        .in("user_id", ids);
      setReporterNames((prev) => {
        const next = { ...prev };
        (emps ?? []).forEach((e) => { if (e.user_id) next[e.user_id] = e.full_name ?? "—"; });
        return next;
      });
    }
  };


  const loadRealStores = async () => {
    const { data } = await supabase
      .from("stores")
      .select("id, name")
      .eq("is_active", true)
      .eq("is_virtual", false)
      .order("name");
    setRealStores((data ?? []) as { id: string; name: string }[]);
  };

  const assignStore = async (alertId: string, storeId: string) => {
    setAssigning(alertId);
    const { error } = await supabase
      .from("occurrence_alerts")
      .update({ store_id: storeId })
      .eq("id", alertId);
    setAssigning(null);
    if (error) {
      toast({ title: "Erro ao atribuir loja", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Loja atribuída" });
    await Promise.all([load(), loadOrphans()]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    loadOrphans();
    loadRealStores();
  }, []);


  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach((a) => set.add(a.occurrences?.category ?? "Sem categoria"));
    return Array.from(set).sort();
  }, [alerts]);

  const storeOptions = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach((a) => set.add(a.stores?.name ?? "Sem loja"));
    return Array.from(set).sort();
  }, [alerts]);

  const subcategoryOptions = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach((a) => {
      if (categoryFilter === "all" || (a.occurrences?.category ?? "Sem categoria") === categoryFilter) {
        if (a.subcategory && a.subcategory.trim()) set.add(a.subcategory.trim());
      }
    });
    return Array.from(set).sort();
  }, [alerts, categoryFilter]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (categoryFilter !== "all" && (a.occurrences?.category ?? "Sem categoria") !== categoryFilter) return false;
      if (storeFilter !== "all" && (a.stores?.name ?? "Sem loja") !== storeFilter) return false;
      if (subcategoryFilter !== "all") {
        const sc = (a.subcategory ?? "").trim();
        if (subcategoryFilter === "__none__") {
          if (sc) return false;
        } else if (sc !== subcategoryFilter) return false;
      }
      return true;
    });
  }, [alerts, categoryFilter, storeFilter, subcategoryFilter]);

  const totalCount = filtered.length;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const key = a.occurrences?.category ?? "Sem categoria";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const bySubcategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const sc = (a.subcategory ?? "").trim();
      if (!sc) return;
      const key = `${a.occurrences?.category ?? "—"} · ${sc}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filtered]);

  const byOccurrence = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const base = a.occurrences?.occurrence ?? "—";
      const sc = (a.subcategory ?? "").trim();
      const key = sc ? `${base} — ${sc}` : base;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  const byStore = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const key = a.stores?.name ?? "Sem loja";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  const trend = useMemo(() => {
    const n = Number(days);
    const map = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      map.set(d, 0);
    }
    filtered.forEach((a) => {
      const d = format(new Date(a.created_at), "yyyy-MM-dd");
      if (map.has(d)) map.set(d, (map.get(d) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({
      date: format(new Date(date + "T00:00:00"), "dd/MM"),
      count,
    }));
  }, [filtered, days]);

  // Recorrências: combinações de (ocorrência + subcategoria + loja) que se repetem.
  // Mostra apenas combinações com 2+ alertas no período, ordenadas pelas mais frequentes.
  const recurrences = useMemo(() => {
    type Key = string;
    const map = new Map<Key, { occurrence: string; subcategory: string; store: string; count: number; lastAt: string }>();
    filtered.forEach((a) => {
      const occ = a.occurrences?.occurrence ?? "—";
      const sub = (a.subcategory ?? "").trim() || "—";
      const store = a.stores?.name ?? "Sem loja";
      const key = `${occ}|${sub}|${store}`;
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        if (a.created_at > cur.lastAt) cur.lastAt = a.created_at;
      } else {
        map.set(key, { occurrence: occ, subcategory: sub, store, count: 1, lastAt: a.created_at });
      }
    });
    return Array.from(map.values())
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.count - a.count || (b.lastAt > a.lastAt ? 1 : -1))
      .slice(0, 15);
  }, [filtered]);

  const buildAggregations = (rows: AlertRow[]) => {
    const cat = new Map<string, number>();
    const sto = new Map<string, number>();
    const sub = new Map<string, number>();
    const occ = new Map<string, number>();
    const rec = new Map<string, { occurrence: string; subcategory: string; store: string; count: number }>();
    rows.forEach((a) => {
      const c = a.occurrences?.category ?? "Sem categoria";
      cat.set(c, (cat.get(c) ?? 0) + 1);
      const s = a.stores?.name ?? "Sem loja";
      sto.set(s, (sto.get(s) ?? 0) + 1);
      const sc = (a.subcategory ?? "").trim();
      if (sc) {
        const k = `${c} · ${sc}`;
        sub.set(k, (sub.get(k) ?? 0) + 1);
      }
      const base = a.occurrences?.occurrence ?? "—";
      const ok = sc ? `${base} — ${sc}` : base;
      occ.set(ok, (occ.get(ok) ?? 0) + 1);
      const rk = `${base}|${sc || "—"}|${s}`;
      const cur = rec.get(rk);
      if (cur) cur.count++;
      else rec.set(rk, { occurrence: base, subcategory: sc || "—", store: s, count: 1 });
    });
    const n = Number(days);
    const tMap = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) tMap.set(format(subDays(new Date(), i), "yyyy-MM-dd"), 0);
    rows.forEach((a) => {
      const d = format(new Date(a.created_at), "yyyy-MM-dd");
      if (tMap.has(d)) tMap.set(d, (tMap.get(d) ?? 0) + 1);
    });
    return {
      por_categoria: Array.from(cat.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      por_loja: Array.from(sto.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      por_subcategoria: Array.from(sub.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      top_ocorrencias: Array.from(occ.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      recorrencias: Array.from(rec.values()).filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, 15),
      tendencia: Array.from(tMap.entries()).map(([date, count]) => ({ date: format(new Date(date + "T00:00:00"), "dd/MM"), count })),
    };
  };

  const runAiAnalysis = async (scope: string = aiScope) => {
    setAiScope(scope);
    setAiOpen(true);
    setAiLoading(true);
    setAiResult(null);
    setAiRanking(null);

    // base = todos os alerts do período, com filtros de categoria/subcategoria já aplicados
    const base = alerts.filter((a) => {
      if (categoryFilter !== "all" && (a.occurrences?.category ?? "Sem categoria") !== categoryFilter) return false;
      if (subcategoryFilter !== "all") {
        const sc = (a.subcategory ?? "").trim();
        if (subcategoryFilter === "__none__") { if (sc) return false; }
        else if (sc !== subcategoryFilter) return false;
      }
      return true;
    });

    try {
      if (scope === "comparativo") {
        // split iFood vs interno por loja a partir do base completo
        const splitMap = new Map<string, { ifood: number; interno: number }>();
        base.forEach((a) => {
          const s = a.stores?.name ?? "Sem loja";
          const isIfood = (a.occurrences?.category ?? "").toUpperCase() === "LOGISTICA"
            || (a.subcategory ?? "").toLowerCase().includes("extravio pelo entregador");
          const cur = splitMap.get(s) ?? { ifood: 0, interno: 0 };
          if (isIfood) cur.ifood++; else cur.interno++;
          splitMap.set(s, cur);
        });
        const por_loja_split = Array.from(splitMap.entries()).map(([name, v]) => ({ name, ...v }));
        const agg = buildAggregations(base);
        const payload = {
          periodo_dias: Number(days),
          total: base.length,
          filtros: {},
          ...agg,
          mode: "ranking" as const,
          por_loja_split,
        };
        const { data, error } = await supabase.functions.invoke("analyze-occurrences-report", { body: payload });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setAiRanking(data.ranking || []);
        return;
      }

      // Geral ou loja específica
      const rows = scope === "geral" ? base : base.filter((a) => (a.stores?.name ?? "") === scope);
      if (rows.length === 0) {
        toast({ title: "Sem dados", description: `Sem ocorrências para ${scope === "geral" ? "o período" : scope}.`, variant: "destructive" });
        setAiOpen(false);
        return;
      }
      const agg = buildAggregations(rows);
      const payload = {
        periodo_dias: Number(days),
        total: rows.length,
        filtros: { loja: scope === "geral" ? undefined : scope },
        escopo: scope === "geral" ? "geral" as const : "loja" as const,
        loja_alvo: scope === "geral" ? undefined : scope,
        ...agg,
      };
      const { data, error } = await supabase.functions.invoke("analyze-occurrences-report", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiResult(data);
    } catch (e) {
      toast({
        title: "Erro na análise",
        description: e instanceof Error ? e.message : "Falha ao processar.",
        variant: "destructive",
      });
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-3 py-4 md:py-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm" data-partner-allow={readOnly ? "true" : undefined}>
          <Link to={readOnly ? "/painel-socio" : "/ocorrencias"}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Link>
        </Button>
        {!readOnly && (
          <Button size="sm" onClick={() => runAiAnalysis("geral")} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            Análise IA
          </Button>
        )}
      </div>

      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Relatório de Ocorrências
        </h1>
        <p className="text-sm text-muted-foreground">
          Visualização dos alertas registrados pelos colaboradores nos últimos {days} dias. Use os filtros para identificar padrões e evitar reincidências.
        </p>
      </div>



      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="15">Últimos 15 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Loja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {storeOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Subcategoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as subcategorias</SelectItem>
            <SelectItem value="__none__">Sem subcategoria</SelectItem>
            {subcategoryOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(categoryFilter !== "all" || storeFilter !== "all" || subcategoryFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter("all"); setStoreFilter("all"); setSubcategoryFilter("all"); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Fila de revisão: ocorrências sem loja */}
      {!readOnly && orphanAlerts.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Siren className="h-5 w-5 text-warning" />
              Ocorrências sem loja ({orphanAlerts.length}) — a revisar
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Registros antigos sem vínculo de loja. Atribua a unidade correta para que apareçam nos relatórios.
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-80">
              <div className="space-y-2">
                {orphanAlerts.map((a) => (
                  <div key={a.id} className="flex flex-col md:flex-row md:items-center gap-2 p-2 rounded-md border bg-background">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {a.occurrences?.occurrence ?? "—"}
                        {a.subcategory && <Badge variant="outline" className="ml-2">{a.subcategory}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {" • "}
                        {reporterNames[a.created_by] ?? "Autor sem cadastro"}
                      </div>
                      {a.note && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{a.note}</div>
                      )}
                    </div>
                    <Select
                      disabled={assigning === a.id}
                      onValueChange={(v) => assignStore(a.id, v)}
                    >
                      <SelectTrigger className="w-full md:w-[200px]">
                        <SelectValue placeholder={assigning === a.id ? "Salvando…" : "Atribuir loja"} />
                      </SelectTrigger>
                      <SelectContent>
                        {realStores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}


      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total de ocorrências</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Siren className="h-5 w-5 text-primary" />
                  {totalCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Categorias diferentes</div>
                <div className="text-2xl font-bold">{byCategory.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Lojas afetadas</div>
                <div className="text-2xl font-bold">{byStore.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tendência */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolução diária</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Por categoria */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por categoria</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="category" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Por loja */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por loja</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {byStore.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStore} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Por subcategoria (causa específica) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por causa específica (subcategoria)</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {bySubcategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma ocorrência com subcategoria no período. Marque "exigir subcategoria" no gerenciador para os tipos genéricos.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySubcategory} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top ocorrências */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top 10 ocorrências mais alertadas</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {byOccurrence.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byOccurrence} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Recorrências (mesma ocorrência + subcategoria + loja repetida 2+ vezes) */}
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Siren className="h-4 w-4 text-destructive" />
                Recorrências (mesmo problema, mesma loja, 2+ vezes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recurrences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma combinação se repetiu no período filtrado. 👍
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-2">Ocorrência</th>
                        <th className="py-2 pr-2">Causa específica</th>
                        <th className="py-2 pr-2">Loja</th>
                        <th className="py-2 pr-2 text-right">Vezes</th>
                        <th className="py-2 pl-2">Última</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recurrences.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-2 font-medium">{r.occurrence}</td>
                          <td className="py-2 pr-2">
                            {r.subcategory !== "—" ? (
                              <Badge variant="default" className="text-[10px]">{r.subcategory}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-xs">{r.store}</td>
                          <td className="py-2 pr-2 text-right">
                            <Badge variant={r.count >= 5 ? "destructive" : "secondary"} className="text-xs">
                              {r.count}x
                            </Badge>
                          </td>
                          <td className="py-2 pl-2 text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(r.lastAt), "dd/MM HH:mm", { locale: ptBR })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>


          {/* Lista detalhada */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ocorrências detalhadas</CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma ocorrência no período.</p>
              ) : (
                <ScrollArea className="h-[420px] pr-3">
                  <div className="space-y-2">
                    {filtered.map((a) => (
                      <div key={a.id} className="border rounded-lg p-3 bg-card space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.occurrences?.category && (
                            <Badge variant="outline">{a.occurrences.category}</Badge>
                          )}
                          {a.subcategory && (
                            <Badge variant="default">{a.subcategory}</Badge>
                          )}
                          {a.stores?.name && (
                            <Badge variant="secondary">{a.stores.name}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{a.occurrences?.occurrence ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Registrada por {reporterNames[a.created_by] ?? "Colaborador"}
                        </p>
                        {a.note && (
                          <p className="text-xs italic text-muted-foreground">"{a.note}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Análise IA das ocorrências
            </DialogTitle>
            <DialogDescription>
              Últimos {days} dias · escolha o escopo da análise
            </DialogDescription>
          </DialogHeader>

          {/* Barra de escopo */}
          <div className="flex flex-wrap gap-1.5 pb-2 border-b">
            {[{ key: "geral", label: "Geral" }, ...STORE_TABS, { key: "comparativo", label: "Comparativo" }].map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={aiScope === t.key ? "default" : "outline"}
                onClick={() => runAiAnalysis(t.key)}
                disabled={aiLoading}
                className="text-xs"
              >
                {t.label}
              </Button>
            ))}
          </div>

          {aiLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Analisando padrões…
            </div>
          )}

          {!aiLoading && aiScope === "comparativo" && aiRanking && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ranking ponderado pelo faturamento: ocorrências internas por R$10.000 vendidos (quanto maior, pior). iFood/entregador é mostrado à parte.
              </p>
              {aiRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de faturamento para o período.</p>
              ) : (
                <div className="space-y-2">
                  {aiRanking.map((r, i) => (
                    <Card key={r.name} className={i === 0 ? "border-destructive/40 bg-destructive/5" : ""}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={i === 0 ? "destructive" : "secondary"} className="text-xs">#{i + 1}</Badge>
                            <span className="font-semibold text-sm">{r.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {r.per_10k_interno.toFixed(2)} / R$10k
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>
                            <div>Faturamento</div>
                            <div className="font-medium text-foreground">R$ {r.revenue.toLocaleString("pt-BR")}</div>
                          </div>
                          <div>
                            <div>Ocorrências</div>
                            <div className="font-medium text-foreground">{r.occurrences} ({r.occ_interno} internas + {r.occ_ifood} iFood)</div>
                          </div>
                        </div>
                        {r.occ_ifood > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Truck className="h-3 w-3" />
                            iFood/entregador: {r.per_10k_ifood.toFixed(2)} / R$10k
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}


          {!aiLoading && aiScope !== "comparativo" && aiResult && (
            <div className="space-y-4">
              {aiResult.resumo && (
                <div className="text-sm leading-relaxed">{aiResult.resumo}</div>
              )}

              {aiResult.loja_critica && (
                <Card className="border-warning/40 bg-warning/5">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold">
                          Loja crítica: {aiResult.loja_critica.nome}
                          <Badge variant="outline" className="ml-2">{aiResult.loja_critica.total} ocorrências</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{aiResult.loja_critica.observacao}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {aiResult.impacto_ifood && (
                <Card className="border-info/40 bg-info/5">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Truck className="h-4 w-4 text-info mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="text-sm font-semibold">
                          Impacto do iFood/entregador
                          <Badge variant="outline" className="ml-2">
                            {aiResult.impacto_ifood.percentual}% · {aiResult.impacto_ifood.total} ocorrências
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{aiResult.impacto_ifood.observacao}</p>
                        {aiResult.impacto_ifood.acoes_mitigacao && aiResult.impacto_ifood.acoes_mitigacao.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1">O que dá pra mitigar do nosso lado:</div>
                            <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                              {aiResult.impacto_ifood.acoes_mitigacao.map((a: string, i: number) => <li key={i}>{a}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {aiResult.causas_principais && aiResult.causas_principais.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Causas principais</h3>
                  <div className="space-y-2">
                    {aiResult.causas_principais.map((c, i) => (
                      <div key={i} className="p-2 rounded-md border bg-card">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{c.causa}</span>
                          <Badge variant="secondary">{c.ocorrencias}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{c.impacto}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiResult.padroes && aiResult.padroes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Padrões observados</h3>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {aiResult.padroes.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {aiResult.sugestoes && aiResult.sugestoes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    Ações internas (o que dá pra resolver)
                  </h3>
                  <div className="space-y-2">
                    {aiResult.sugestoes.map((s, i) => (
                      <div key={i} className="p-2 rounded-md border bg-card">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">{s.acao}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-xs">{s.responsavel}</Badge>
                            <Badge
                              variant={s.prazo === "imediato" ? "destructive" : s.prazo === "esta_semana" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {s.prazo === "imediato" ? "Imediato" : s.prazo === "esta_semana" ? "Esta semana" : "Este mês"}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{s.detalhe}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

