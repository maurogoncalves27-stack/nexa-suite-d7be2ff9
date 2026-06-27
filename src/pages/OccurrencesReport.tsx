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
import { ArrowLeft, BarChart3, Loader2, Siren } from "lucide-react";
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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

  return (
    <div className="container mx-auto px-3 py-4 md:py-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Relatório de Ocorrências
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualização dos alertas registrados pelos colaboradores nos últimos {days} dias. Use os filtros para identificar padrões e evitar reincidências.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" data-partner-allow={readOnly ? "true" : undefined}>
          <Link to={readOnly ? "/painel-socio" : "/ocorrencias"}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Link>
        </Button>
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
                    <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
    </div>
  );
}
