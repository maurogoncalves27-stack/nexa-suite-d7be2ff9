import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, CheckCircle2, XCircle, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StarRating } from "@/components/evaluations/StarRating";
import TrainingEvaluationDialog from "./TrainingEvaluationDialog";
import type { TrainingCriterion } from "@/pages/Trainings";

interface Props {
  criteria: TrainingCriterion[];
}

interface HistoryRow {
  id: string;
  full_name: string;
  position: string | null;
  training_status: string;
  training_start_date: string | null;
  training_end_date: string | null;
  admission_date: string | null;
  contracting_store?: { name: string } | null;
}

interface ScoreRow {
  employee_id: string;
  criterion_id: string;
  score: number;
}

export default function TrainingHistoryPanel({ criteria }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, position, training_status, training_start_date, training_end_date, admission_date, contracting_store:stores!employees_store_id_fkey(name)")
      .in("training_status", ["approved", "rejected"])
      .order("training_end_date", { ascending: false, nullsFirst: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });

    const list = (data ?? []) as unknown as HistoryRow[];
    setRows(list);

    if (list.length > 0) {
      const ids = list.map((t) => t.id);
      const { data: sc } = await supabase
        .from("training_evaluations")
        .select("employee_id, criterion_id, score")
        .in("employee_id", ids);
      setScores((sc ?? []) as ScoreRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const computeAverage = (employeeId: string) => {
    const empScores = scores.filter((s) => s.employee_id === employeeId);
    if (empScores.length === 0) return null;
    let sw = 0, w = 0;
    for (const s of empScores) {
      const c = criteria.find((x) => x.id === s.criterion_id);
      if (!c) continue;
      sw += Number(s.score) * Number(c.weight);
      w += Number(c.weight);
    }
    return w > 0 ? sw / w : null;
  };

  const filtered = rows.filter((r) =>
    !search || r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum treinamento finalizado.</div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => {
              const avg = computeAverage(r.id);
              return (
                <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.position ?? "—"} · {r.contracting_store?.name ?? "—"}
                      </div>
                    </div>
                    {r.training_status === "approved" ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Aprovado
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0">
                        <XCircle className="h-3 w-3 mr-1" />Reprovado
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Período</div>
                      <div>{r.training_start_date ?? "—"} → {r.training_end_date ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Admissão</div>
                      <div>{r.admission_date ?? "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">Média final</div>
                      {avg != null ? (
                        <div className="flex items-center gap-2">
                          <StarRating value={avg} readOnly size={14} />
                          <span className="text-muted-foreground">{avg.toFixed(1)}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>
                      <Eye className="h-4 w-4 mr-1" /> Ver
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead className="w-48">Média final</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const avg = computeAverage(r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.position ?? "—"}</TableCell>
                      <TableCell>{r.contracting_store?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.training_start_date ?? "—"} → {r.training_end_date ?? "—"}
                      </TableCell>
                      <TableCell>{r.admission_date ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {avg != null ? (
                          <div className="flex items-center gap-2">
                            <StarRating value={avg} readOnly size={14} />
                            <span className="text-xs text-muted-foreground">{avg.toFixed(1)}</span>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.training_status === "approved" ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Aprovado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />Reprovado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setOpenId(r.id)} title="Ver avaliações">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <TrainingEvaluationDialog
        open={!!openId}
        onClose={() => setOpenId(null)}
        employee={openRow as any}
        criteria={criteria}
        onSaved={load}
      />
    </div>
  );
}
