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
import { ArrowLeft, BarChart3, Loader2, Siren, CheckCircle2, Eye } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

interface AlertRow {
  id: string;
  occurrence_id: string;
  created_by: string;
  store_id: string | null;
  note: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  occurrences?: { occurrence: string; category: string | null; order_correct: boolean } | null;
  stores?: { name: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(var(--destructive))",
  seen: "hsl(var(--primary))",
  resolved: "hsl(var(--muted-foreground))",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  seen: "Vista",
  resolved: "Resolvida",
};

export default function OccurrencesReport() {
  const { isPartner, isAdmin, isManager, isSuperUser } = useAuth();
  const { mode: viewMode } = useViewMode();
  const readOnly = (viewMode === "socio" && (isPartner || isSuperUser)) || (isPartner && !isAdmin && !isManager);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string>("30");
  const [reporterNames, setReporterNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const since = startOfDay(subDays(new Date(), Number(days))).toISOString();
    const { data, error } = await supabase
      .from("occurrence_alerts")
      .select(
        "id, occurrence_id, created_by, store_id, note, status, created_at, resolved_at, occurrences(occurrence, category, order_correct), stores(name)",
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

    // Buscar nomes de quem criou
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

  const updateStatus = async (id: string, status: "seen" | "resolved") => {
    const resolvedAt = status === "resolved" ? new Date().toISOString() : null;
    const patch = status === "resolved" ? { status, resolved_at: resolvedAt } : { status };
    const { error } = await supabase.from("occurrence_alerts").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status, resolved_at: resolvedAt ?? a.resolved_at } : a)),
    );
  };

  const totalCount = alerts.length;
  const pendingCount = alerts.filter((a) => a.status === "pending").length;
  const resolvedCount = alerts.filter((a) => a.status === "resolved").length;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    alerts.forEach((a) => {
      const key = a.occurrences?.category ?? "Sem categoria";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [alerts]);

  const byOccurrence = useMemo(() => {
    const map = new Map<string, number>();
    alerts.forEach((a) => {
      const key = a.occurrences?.occurrence ?? "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [alerts]);

  const byStore = useMemo(() => {
    const map = new Map<string, number>();
    alerts.forEach((a) => {
      const key = a.stores?.name ?? "Sem loja";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [alerts]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    alerts.forEach((a) => map.set(a.status, (map.get(a.status) ?? 0) + 1));
    return Array.from(map.entries()).map(([status, count]) => ({
      status,
      label: STATUS_LABEL[status] ?? status,
      count,
    }));
  }, [alerts]);

  const trend = useMemo(() => {
    const n = Number(days);
    const map = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      map.set(d, 0);
    }
    alerts.forEach((a) => {
      const d = format(new Date(a.created_at), "yyyy-MM-dd");
      if (map.has(d)) map.set(d, (map.get(d) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({
      date: format(new Date(date + "T00:00:00"), "dd/MM"),
      count,
    }));
  }, [alerts, days]);

  return (
    <div className="container mx-auto px-3 py-4 md:py-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Relatório de Ocorrências
          </h1>
          <p className="text-sm text-muted-foreground">
            Alertas registrados pelos colaboradores nos últimos {days} dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
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
          <Button asChild variant="outline" size="sm" data-partner-allow={readOnly ? "true" : undefined}>
            <Link to={readOnly ? "/painel-socio" : "/ocorrencias"}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total de alertas</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Siren className="h-5 w-5 text-primary" />
                  {totalCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Pendentes</div>
                <div className="text-2xl font-bold text-destructive">{pendingCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Resolvidos</div>
                <div className="text-2xl font-bold text-primary">{resolvedCount}</div>
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

            {/* Por status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por status</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {byStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byStatus} dataKey="count" nameKey="label" outerRadius={90} label>
                        {byStatus.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "hsl(var(--primary))"} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
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
              <CardTitle className="text-base">Alertas detalhados</CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum alerta no período.</p>
              ) : (
                <ScrollArea className="h-[420px] pr-3">
                  <div className="space-y-2">
                    {alerts.map((a) => (
                      <div key={a.id} className="border rounded-lg p-3 bg-card space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={a.status === "pending" ? "destructive" : a.status === "resolved" ? "secondary" : "default"}
                              >
                                {STATUS_LABEL[a.status] ?? a.status}
                              </Badge>
                              {a.occurrences?.category && (
                                <Badge variant="outline">{a.occurrences.category}</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="font-medium mt-1 text-sm">{a.occurrences?.occurrence ?? "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {reporterNames[a.created_by] ?? "Colaborador"}
                              {a.stores?.name ? ` • ${a.stores.name}` : ""}
                            </p>
                            {a.note && (
                              <p className="text-xs mt-1 italic text-muted-foreground">"{a.note}"</p>
                            )}
                          </div>
                          {!readOnly && (
                            <div className="flex gap-1 shrink-0">
                              {a.status === "pending" && (
                                <Button size="sm" variant="outline" className="h-8" onClick={() => updateStatus(a.id, "seen")}>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> Vista
                                </Button>
                              )}
                              {a.status !== "resolved" && (
                                <Button size="sm" className="h-8" onClick={() => updateStatus(a.id, "resolved")}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
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
