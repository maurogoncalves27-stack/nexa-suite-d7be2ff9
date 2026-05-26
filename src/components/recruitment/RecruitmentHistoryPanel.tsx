import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Loader2, User, Search, TrendingUp, XCircle, UserMinus, Bookmark, Briefcase } from "lucide-react";
import { STAGES, LEGACY_STAGES, type StageValue } from "@/lib/recruitment";
import { CandidateFlowDialog as CandidateDetailDialog } from "./CandidateFlowDialog";

interface CandidateRow {
  id: string;
  full_name: string;
  current_stage: StageValue;
  applied_at: string;
  job_opening_id: string;
  source: string | null;
  ai_score: number | null;
}

interface JobRow {
  id: string;
  title: string;
  position: string;
}

const CLOSED_STAGES: StageValue[] = ["reprovado", "desistiu", "talento_futuro", "contratado"];

export default function RecruitmentHistoryPanel() {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const allClosed = [...CLOSED_STAGES, ...LEGACY_STAGES];
    const [cRes, jRes] = await Promise.all([
      supabase
        .from("job_candidates")
        .select("id, full_name, current_stage, applied_at, job_opening_id, source, ai_score")
        .in("current_stage", allClosed)
        .order("applied_at", { ascending: false }),
      supabase.from("job_openings").select("id, title, position"),
    ]);
    setCandidates((cRes.data ?? []) as CandidateRow[]);
    const map: Record<string, JobRow> = {};
    (jRes.data ?? []).forEach((j: any) => { map[j.id] = j; });
    setJobs(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => {
    const total = candidates.length;
    const hired = candidates.filter((c) => c.current_stage === "contratado").length;
    const rejected = candidates.filter((c) => c.current_stage === "reprovado").length;
    const dropped = candidates.filter((c) => c.current_stage === "desistiu").length;
    const future = candidates.filter((c) => c.current_stage === "talento_futuro").length;
    const conversion = total > 0 ? Math.round((hired / total) * 100) : 0;
    return { total, hired, rejected, dropped, future, conversion };
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (stageFilter !== "all" && c.current_stage !== stageFilter) return false;
      if (search && !c.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [candidates, search, stageFilter]);

  const stageMeta = (s: StageValue) => STAGES.find((x) => x.value === s);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Histórico de processos seletivos</h2>
          <p className="text-sm text-muted-foreground">
            Métricas e candidatos encerrados (contratados, reprovados, desistentes e talentos futuros).
          </p>
        </div>
      </div>

      {/* Dashboard de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total encerrados</div>
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Contratados
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.hired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Reprovados
            </div>
            <div className="text-2xl font-bold text-destructive">{metrics.rejected}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <UserMinus className="h-3 w-3" /> Desistentes
            </div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{metrics.dropped}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> Talento futuro
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{metrics.future}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Taxa de contratação</div>
            <div className="text-2xl font-bold text-primary">{metrics.conversion}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Listagem com filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidatos encerrados</CardTitle>
          <CardDescription>Clique em um candidato para ver os detalhes e mover para outra etapa, se necessário.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas encerradas</SelectItem>
                <SelectItem value="contratado">Contratados</SelectItem>
                <SelectItem value="reprovado">Reprovados</SelectItem>
                <SelectItem value="desistiu">Desistentes</SelectItem>
                <SelectItem value="talento_futuro">Talento futuro</SelectItem>
                {LEGACY_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{stageMeta(s)?.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-md">
              Nenhum candidato encerrado encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map((c) => {
                const meta = stageMeta(c.current_stage);
                const job = jobs[c.job_opening_id];
                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm flex items-center gap-1 truncate">
                          <User className="h-3.5 w-3.5 shrink-0" /> {c.full_name}
                        </div>
                        {meta && (
                          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 shrink-0 ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        )}
                      </div>
                      {job && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Briefcase className="h-3 w-3" /> {job.title}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                        <span>{new Date(c.applied_at).toLocaleDateString("pt-BR")}</span>
                        {c.ai_score != null && <span>IA: {c.ai_score}/100</span>}
                      </div>
                      {c.source && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{c.source}</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <CandidateDetailDialog
          candidateId={selectedId}
          jobPosition={jobs[candidates.find((c) => c.id === selectedId)?.job_opening_id ?? ""]?.position ?? ""}
          open={!!selectedId}
          onOpenChange={(o) => !o && setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
