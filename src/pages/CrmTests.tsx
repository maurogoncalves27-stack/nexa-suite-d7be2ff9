import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Play, Loader2, CheckCircle2, XCircle, MessageSquare, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type ScenarioOpt = { id: string; label: string };
type TestRun = {
  id: string;
  run_id: string;
  scenario: string;
  session_id: string;
  persona: { nome?: string; telefone?: string; bairro?: string } | null;
  passed: boolean | null;
  score: number | null;
  issues: string[] | null;
  evaluator_notes: string | null;
  created_at: string;
};
type ConvMsg = { id: string; role: string; content: string; created_at?: string };

export default function CrmTests() {
  const [scenarios, setScenarios] = useState<ScenarioOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<number>(1);
  const [starting, setStarting] = useState(false);
  const [history, setHistory] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [expected, setExpected] = useState<number>(0);
  const [convOpen, setConvOpen] = useState(false);
  const [convMsgs, setConvMsgs] = useState<ConvMsg[]>([]);
  const [convTitle, setConvTitle] = useState("");

  // Carrega cenários
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("parme-chat-simulate", { body: { list: true } });
      if (error) { toast.error("Erro ao listar cenários"); return; }
      const list = (data as { scenarios?: ScenarioOpt[] })?.scenarios ?? [];
      setScenarios(list);
      setSelected(new Set(list.map((s) => s.id)));
    })();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("chat_test_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Erro ao carregar histórico");
    setHistory((data ?? []) as TestRun[]);
    setLoading(false);
  };
  useEffect(() => { loadHistory(); }, []);

  // Poll enquanto rodando
  useEffect(() => {
    if (!currentRunId) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("chat_test_runs")
        .select("*")
        .eq("run_id", currentRunId)
        .order("created_at", { ascending: true });
      const arr = (data ?? []) as TestRun[];
      if (arr.length >= expected) {
        setCurrentRunId(null);
        toast.success(`Bateria concluída: ${arr.length}/${expected}`);
        loadHistory();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [currentRunId, expected]);

  const start = async () => {
    if (selected.size === 0) { toast.error("Selecione ao menos 1 cenário"); return; }
    setStarting(true);
    const total = selected.size * runs;
    const { data, error } = await supabase.functions.invoke("parme-chat-simulate", {
      body: { scenarios: Array.from(selected), runs_per_scenario: runs },
    });
    setStarting(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    const runId = (data as { run_id?: string })?.run_id;
    if (!runId) { toast.error("Resposta inválida"); return; }
    setCurrentRunId(runId);
    setExpected(total);
    toast.info(`Bateria iniciada (${total} conversas). Atualizando a cada 3s...`);
  };

  const openConv = async (run: TestRun) => {
    setConvTitle(`${run.scenario} — ${run.persona?.nome ?? ""}`);
    setConvOpen(true);
    setConvMsgs([]);
    const { data, error } = await supabase.functions.invoke("parme-get-conversation-messages", {
      body: { session_id: run.session_id },
    });
    if (error) { toast.error("Erro ao carregar conversa"); return; }
    setConvMsgs(((data as { messages?: ConvMsg[] })?.messages ?? []));
  };

  const grouped = useMemo(() => {
    const map = new Map<string, TestRun[]>();
    for (const r of history) {
      const k = r.run_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) =>
      b[1][0].created_at.localeCompare(a[1][0].created_at),
    );
  }, [history]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Testes da Giana
        </h1>
        <p className="text-muted-foreground">
          Rode baterias de clientes simulados conversando com a Giana. Cada conversa fica gravada no CRM com tag de teste.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova bateria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Cenários ({selected.size}/{scenarios.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {scenarios.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded border hover:bg-muted/50">
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={(c) => {
                      const n = new Set(selected);
                      if (c) n.add(s.id); else n.delete(s.id);
                      setSelected(n);
                    }}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(scenarios.map((s) => s.id)))}>
                Marcar todos
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Execuções por cenário: <strong>{runs}</strong></p>
            <Slider value={[runs]} min={1} max={3} step={1} onValueChange={(v) => setRuns(v[0])} />
          </div>

          <Button onClick={start} disabled={starting || !!currentRunId} className="w-full md:w-auto">
            {starting || currentRunId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {currentRunId ? "Rodando..." : `Iniciar (${selected.size * runs} conversas)`}
          </Button>
          {currentRunId && (
            <p className="text-xs text-muted-foreground">
              Bateria <code>{currentRunId}</code> em andamento. O histórico atualiza automaticamente.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Histórico</CardTitle>
          <Button size="sm" variant="ghost" onClick={loadHistory}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma bateria executada ainda.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([runId, items]) => {
                const passed = items.filter((i) => i.passed).length;
                const avg = items.reduce((a, b) => a + (b.score ?? 0), 0) / items.length;
                return (
                  <div key={runId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{runId}</p>
                        <p className="text-xs">
                          {formatDistanceToNow(new Date(items[0].created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{items.length} conversas</Badge>
                        <Badge variant={passed === items.length ? "default" : "destructive"}>
                          {passed}/{items.length} ok
                        </Badge>
                        <Badge variant="secondary">média {avg.toFixed(1)}/10</Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {items.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {r.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <span className="font-medium truncate">{r.scenario}</span>
                            <span className="text-muted-foreground truncate">{r.persona?.nome}</span>
                            <Badge variant="outline" className="ml-auto md:ml-0">{r.score ?? 0}/10</Badge>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => openConv(r)}>
                            <MessageSquare className="h-4 w-4 mr-1" /> Ver conversa
                          </Button>
                        </div>
                      ))}
                    </div>
                    {items.some((i) => (i.issues ?? []).length > 0) && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Issues encontradas</summary>
                        <ul className="list-disc ml-5 mt-1 space-y-0.5">
                          {items.flatMap((i) => (i.issues ?? []).map((iss, k) => (
                            <li key={`${i.id}-${k}`}><strong>{i.scenario}:</strong> {iss}</li>
                          )))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={convOpen} onOpenChange={setConvOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{convTitle}</DialogTitle>
            <DialogDescription>Conversa simulada com a Giana</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {convMsgs.length === 0 ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : convMsgs.map((m) => (
              <div key={m.id} className={`p-2 rounded text-sm ${m.role === "user" ? "bg-muted" : "bg-primary/10"}`}>
                <p className="text-xs font-semibold mb-1">{m.role === "user" ? "Cliente" : "Giana"}</p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
