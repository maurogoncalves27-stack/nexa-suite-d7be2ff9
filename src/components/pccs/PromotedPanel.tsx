import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ArrowUp, ArrowRight, TrendingUp, Search, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Row = {
  id: string;
  employee_id: string;
  promotion_type: "horizontal" | "vertical";
  from_position: string | null;
  to_position: string | null;
  from_level: string | null;
  to_level: string | null;
  from_salary: number | null;
  to_salary: number | null;
  promoted_by_name: string | null;
  created_at: string;
  effective_date: string | null;
  applied_at: string | null;
  employee_name?: string;
};

const currency = (v: number | null) =>
  v == null ? "-" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const dateBR = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function PromotedPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "horizontal" | "vertical">("all");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("promotion_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const empIds: string[] = Array.from(
        new Set(((data ?? []) as any[]).map((r) => String(r.employee_id))),
      );
      let names: Record<string, string> = {};
      if (empIds.length) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, full_name")
          .in("id", empIds);
        names = Object.fromEntries((emps ?? []).map((e: any) => [e.id, e.full_name]));
      }

      setRows((data ?? []).map((r: any) => ({ ...r, employee_name: names[r.employee_id] ?? "—" })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scheduled = useMemo(() => rows.filter((r) => !r.applied_at), [rows]);
  const applied = useMemo(() => rows.filter((r) => !!r.applied_at), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applied.filter((r) => {
      if (filter !== "all" && r.promotion_type !== filter) return false;
      if (!q) return true;
      return (
        (r.employee_name ?? "").toLowerCase().includes(q) ||
        (r.to_position ?? "").toLowerCase().includes(q) ||
        (r.from_position ?? "").toLowerCase().includes(q)
      );
    });
  }, [applied, search, filter]);

  const stats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = applied.filter((r) => new Date(r.applied_at as string) >= start).length;
    const horizontal = applied.filter((r) => r.promotion_type === "horizontal").length;
    const vertical = applied.filter((r) => r.promotion_type === "vertical").length;
    const totalIncrease = applied.reduce(
      (acc, r) => acc + Math.max(0, (Number(r.to_salary) || 0) - (Number(r.from_salary) || 0)),
      0
    );
    return { thisMonth, horizontal, vertical, totalIncrease };
  }, [applied]);

  const cancelScheduled = async (r: Row) => {
    if (!confirm(
      `Cancelar promoção agendada de ${r.employee_name}?\n\n` +
      `Efetiva em ${dateBR(r.effective_date)}. Esta ação não pode ser desfeita.`,
    )) return;
    setCancelingId(r.id);
    try {
      const { error } = await (supabase as any).from("promotion_history").delete().eq("id", r.id);
      if (error) throw error;
      toast.success(`Promoção agendada de ${r.employee_name} cancelada.`);
      await load();
    } catch (e: any) {
      toast.error("Erro ao cancelar", { description: e.message });
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Histórico de promoções aplicadas e agendadas (horizontais e verticais).
        </p>
        <Button size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Agendadas</div>
          <div className="text-2xl font-bold text-warning">{scheduled.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Aplicadas no mês</div>
          <div className="text-2xl font-bold">{stats.thisMonth}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Horizontais / Verticais</div>
          <div className="text-2xl font-bold">{stats.horizontal} / {stats.vertical}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Aumento acumulado</div>
          <div className="text-2xl font-bold">{currency(stats.totalIncrease)}</div>
        </CardContent></Card>
      </div>

      {scheduled.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              Agendadas ({scheduled.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scheduled.map((r) => {
                const delta = (Number(r.to_salary) || 0) - (Number(r.from_salary) || 0);
                const isVertical = r.promotion_type === "vertical";
                return (
                  <div key={r.id} className="p-3 rounded-lg border border-warning/40 bg-warning/5 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.employee_name}</span>
                        <Badge variant={isVertical ? "default" : "secondary"} className="text-[10px]">
                          {isVertical ? <><ArrowUp className="h-3 w-3 mr-0.5" />Vertical</> : <><ArrowRight className="h-3 w-3 mr-0.5" />Horizontal</>}
                        </Badge>
                        <Badge className="bg-warning text-warning-foreground text-[10px]">
                          Efetiva em {dateBR(r.effective_date)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {isVertical ? (
                          <>{r.from_position ?? "—"} <ArrowRight className="inline h-3 w-3" /> <strong>{r.to_position ?? "—"}</strong></>
                        ) : (
                          <>{r.to_position ?? "—"} — nível <strong>{r.from_level}</strong> <ArrowRight className="inline h-3 w-3" /> nível <strong>{r.to_level}</strong></>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Agendada em {format(new Date(r.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {r.promoted_by_name && <> · por {r.promoted_by_name}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">{currency(r.from_salary)} <ArrowRight className="inline h-3 w-3" /></div>
                        <div className="font-bold">{currency(r.to_salary)}</div>
                        {delta > 0 && <div className="text-xs text-success">+{currency(delta)}</div>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelScheduled(r)}
                        disabled={cancelingId === r.id}
                      >
                        {cancelingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        <span className="ml-1">Cancelar</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou cargo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todas</Button>
          <Button size="sm" variant={filter === "horizontal" ? "default" : "outline"} onClick={() => setFilter("horizontal")}>Horizontais</Button>
          <Button size="sm" variant={filter === "vertical" ? "default" : "outline"} onClick={() => setFilter("vertical")}>Verticais</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Aplicadas ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma promoção aplicada ainda.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const delta = (Number(r.to_salary) || 0) - (Number(r.from_salary) || 0);
                const isVertical = r.promotion_type === "vertical";
                return (
                  <div key={r.id} className="p-3 rounded-lg border bg-card flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.employee_name}</span>
                        <Badge variant={isVertical ? "default" : "secondary"} className="text-[10px]">
                          {isVertical ? <><ArrowUp className="h-3 w-3 mr-0.5" />Vertical</> : <><ArrowRight className="h-3 w-3 mr-0.5" />Horizontal</>}
                        </Badge>
                        <Badge variant="success" className="text-[10px]">
                          Efetiva em {dateBR(r.effective_date)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {isVertical ? (
                          <>{r.from_position ?? "—"} <ArrowRight className="inline h-3 w-3" /> <strong>{r.to_position ?? "—"}</strong></>
                        ) : (
                          <>{r.to_position ?? "—"} — nível <strong>{r.from_level}</strong> <ArrowRight className="inline h-3 w-3" /> nível <strong>{r.to_level}</strong></>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Agendada em {format(new Date(r.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {r.promoted_by_name && <> · por {r.promoted_by_name}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{currency(r.from_salary)} <ArrowRight className="inline h-3 w-3" /></div>
                      <div className="font-bold">{currency(r.to_salary)}</div>
                      {delta > 0 && <div className="text-xs text-success">+{currency(delta)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
