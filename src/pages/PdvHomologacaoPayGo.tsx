/**
 * /pdv-novo/homologacao-paygo
 * Painel para rodar os 54 cenários do roteiro Setis PayGo v20241216 contra
 * o NEXA ACBr Agent (porta 3030) e exportar a planilha de retorno.
 * Fase 1: execução de vendas + admin + manual; cancelamentos/queda energia
 * ficam para Fase 2.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  ScrollText, Play, CheckCircle2, XCircle, MinusCircle, Loader2,
  Download, RefreshCw, Plus, FileText,
} from "lucide-react";
import {
  HOMOLOGATION_STEPS, type HomologationStep,
} from "@/lib/tef/homologation/steps";
import { exportHomologationXlsx, type StepResultRow } from "@/lib/tef/homologation/exporter";
import { loadTefConfig, type TefConfig } from "@/lib/tef";
import { createAcbrAdapter, acbrCancelarVenda, acbrAdministrativo } from "@/lib/tef/acbrAdapter";

const ACBR_AGENT_URL = "http://127.0.0.1:3030";

/** Converte ISO timestamp em DDMMAAAA usado pelo ACBr. */
const toAcbrDate = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
};

interface Store { id: string; name: string; }
interface RunRow {
  id: string;
  store_id: string | null;
  started_at: string;
  finished_at: string | null;
  pdc_code: string | null;
  host_url: string | null;
}
interface StepRow {
  id: string;
  step_number: number;
  status: "pending" | "ok" | "fail" | "skipped" | "na";
  nsu: string | null;
  requnum: string | null;
  authorization_code: string | null;
  card_brand: string | null;
  amount: number | null;
  observations: string | null;
  executed_at: string | null;
}

const DEFAULT_PDC = "111476";
const DEFAULT_HOST = "pos-transac-sb.tpgweb.io:31735";

const StatusBadge = ({ status }: { status: StepRow["status"] }) => {
  const map: Record<StepRow["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pending: { label: "Pendente", cls: "bg-muted text-muted-foreground", Icon: MinusCircle },
    ok:      { label: "OK",       cls: "bg-success text-success-foreground", Icon: CheckCircle2 },
    fail:    { label: "Falhou",   cls: "bg-destructive text-destructive-foreground", Icon: XCircle },
    skipped: { label: "Pulado",   cls: "bg-warning text-warning-foreground", Icon: MinusCircle },
    na:      { label: "N/A",      cls: "bg-secondary text-secondary-foreground", Icon: MinusCircle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge className={`${cls} gap-1`}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
};

export default function PdvHomologacaoPayGo() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [run, setRun] = useState<RunRow | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState<number | null>(null);
  const [pdcCode, setPdcCode] = useState(DEFAULT_PDC);
  const [hostUrl, setHostUrl] = useState(DEFAULT_HOST);

  // --- Lojas elegíveis (físicas, sem iFood Homologação) -------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .neq("name", "iFood Homologação")
        .order("name");
      const list = (data ?? []) as Store[];
      setStores(list);
      if (list[0] && !storeId) setStoreId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Carrega última rodada aberta da loja --------------------------------
  const loadActiveRun = async (forStoreId: string) => {
    setLoading(true);
    const { data: runRow } = await supabase
      .from("pdv_tef_homologation_runs")
      .select("id, store_id, started_at, finished_at, pdc_code, host_url")
      .eq("store_id", forStoreId)
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runRow) {
      setRun(runRow as RunRow);
      setPdcCode(runRow.pdc_code ?? DEFAULT_PDC);
      setHostUrl(runRow.host_url ?? DEFAULT_HOST);
      await loadSteps(runRow.id);
    } else {
      setRun(null);
      setSteps([]);
    }
    setLoading(false);
  };

  useEffect(() => { if (storeId) void loadActiveRun(storeId); }, [storeId]);

  const loadSteps = async (runId: string) => {
    const { data } = await supabase
      .from("pdv_tef_homologation_steps")
      .select("id, step_number, status, nsu, requnum, authorization_code, card_brand, amount, observations, executed_at")
      .eq("run_id", runId)
      .order("step_number");
    setSteps((data ?? []) as StepRow[]);
  };

  // --- Cria rodada nova (com 54 steps em pending) -------------------------
  const createRun = async () => {
    if (!storeId) return;
    const { data: newRun, error } = await supabase
      .from("pdv_tef_homologation_runs")
      .insert({
        store_id: storeId,
        pdc_code: pdcCode,
        host_url: hostUrl,
        integration_type: "Biblioteca Windows",
        acquirer: "DEMO/REDE/PIX C6/PIX CIELO",
      })
      .select("id, store_id, started_at, finished_at, pdc_code, host_url")
      .single();
    if (error || !newRun) {
      toast({ title: "Erro ao criar rodada", description: error?.message, variant: "destructive" });
      return;
    }
    const rows = HOMOLOGATION_STEPS.map((s) => ({
      run_id: newRun.id,
      step_number: s.number,
      step_name: s.name,
      mandatory: s.mandatory,
      status: s.kind === "controlpay-na" ? "na" : "pending",
    }));
    const { error: stepErr } = await supabase.from("pdv_tef_homologation_steps").insert(rows);
    if (stepErr) {
      toast({ title: "Erro ao inicializar passos", description: stepErr.message, variant: "destructive" });
      return;
    }
    setRun(newRun as RunRow);
    await loadSteps(newRun.id);
    toast({ title: "Rodada iniciada", description: `54 passos criados para a loja selecionada.` });
  };

  // --- Executa um passo ----------------------------------------------------
  const executeStep = async (step: HomologationStep) => {
    if (!run) return;
    setBusyStep(step.number);
    try {
      let status: StepRow["status"] = "ok";
      let nsu: string | null = null;
      let auth: string | null = null;
      let brand: string | null = null;
      let amount: number | null = null;
      let obs: string | null = null;
      let raw: unknown = null;

      if (step.kind === "controlpay-na") {
        status = "na";
        obs = "ControlPay REST não utilizado.";
      } else if (step.kind === "sale" || step.kind === "sale-cancel") {
        const cfg: TefConfig = {
          ...(await loadTefConfig(storeId)),
          provider: "acbr",
          agentUrl: ACBR_AGENT_URL,
          acquirer: step.sale?.acquirer,
        };
        const adapter = createAcbrAdapter(cfg);
        const res = await adapter.processPayment({
          amount: step.sale?.amount ?? 1,
          method: step.sale?.method ?? "credit",
          installments: step.sale?.installments,
          storeId,
        });
        amount = step.sale?.amount ?? 1;
        nsu = res.nsu ?? null;
        auth = res.authorizationCode ?? null;
        brand = res.cardBrand ?? null;
        raw = res.raw ?? null;
        if (res.status === "approved") {
          status = step.number === 4 ? "fail" : "ok"; // passo 4 espera NEGADA
          obs = res.message ?? null;
        } else if (res.status === "declined") {
          status = step.number === 4 ? "ok" : "fail";
          obs = `Negada: ${res.message ?? ""}`;
        } else {
          status = "fail";
          obs = res.message ?? "Falha no fluxo TEF";
        }
      } else if (step.kind === "admin") {
        const res = await acbrAdministrativo(ACBR_AGENT_URL, step.adminCode ?? 0);
        if (!res.ok) {
          status = "fail";
          obs = res.error ?? "Falha na operação administrativa";
        } else {
          obs = res.parsed["mensagem"] ?? res.parsed["mensagemresultado"] ?? "Operação administrativa concluída.";
        }
        raw = res;
      } else if (step.kind === "cancel-prev") {
        // Procura a venda base no banco
        let baseNsu: string | null = null;
        let baseAmount: number | null = null;
        let baseDate: string | null = null;
        if (step.cancelsStep) {
          const base = steps.find((s) => s.step_number === step.cancelsStep);
          baseNsu = base?.nsu ?? null;
          baseAmount = base?.amount ?? null;
          baseDate = base?.executed_at ?? null;
        }
        // Permite override pelo campo NSU já preenchido manualmente nesta linha
        const row = stepByNumber(step.number);
        baseNsu = row?.nsu || baseNsu;
        baseAmount = row?.amount ?? baseAmount;

        if (!baseNsu || !baseAmount) {
          toast({
            title: "Dados insuficientes",
            description: `Preencha NSU e valor da venda original (passo ${step.cancelsStep ?? "?"}) antes de cancelar.`,
            variant: "destructive",
          });
          setBusyStep(null);
          return;
        }
        const res = await acbrCancelarVenda(ACBR_AGENT_URL, {
          nsu: baseNsu,
          valor: baseAmount,
          data: toAcbrDate(baseDate),
        });
        if (!res.ok) {
          status = "fail";
          obs = res.error ?? "Falha no cancelamento";
        } else {
          nsu = res.parsed["nsu"] ?? res.parsed["nsuhost"] ?? baseNsu;
          auth = res.parsed["codigoautorizacao"] ?? null;
          amount = baseAmount;
          obs = res.parsed["mensagem"] ?? res.parsed["mensagemresultado"] ?? `Cancelada venda NSU ${baseNsu}`;
        }
        raw = res;
      } else {
        // manual / power-cut / generic-input / pending
        // Operador executa no PdC/pinpad e usa os botões "Marcar" desta linha.
        toast({
          title: "Execução manual",
          description: `Passo ${step.number} (${step.name}): execute no PdC/pinpad e use 'Marcar' nas ações desta linha.`,
        });
        setBusyStep(null);
        return;
      }

      await supabase
        .from("pdv_tef_homologation_steps")
        .update({
          status, nsu, requnum: nsu, authorization_code: auth,
          card_brand: brand, amount, observations: obs,
          raw_response: raw as never,
          executed_at: new Date().toISOString(),
        })
        .eq("run_id", run.id)
        .eq("step_number", step.number);
      await loadSteps(run.id);
      toast({
        title: status === "ok" ? "Passo concluído" : "Passo falhou",
        description: nsu ? `NSU ${nsu}` : (obs ?? ""),
        variant: status === "ok" ? "default" : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro ao executar", description: msg, variant: "destructive" });
    } finally {
      setBusyStep(null);
    }
  };

  // --- Marcar passo manualmente -------------------------------------------
  const markStep = async (
    step: HomologationStep,
    patch: Partial<Pick<StepRow, "status" | "nsu" | "observations">>,
  ) => {
    if (!run) return;
    await supabase
      .from("pdv_tef_homologation_steps")
      .update({
        ...patch,
        requnum: patch.nsu ?? undefined,
        executed_at: new Date().toISOString(),
      })
      .eq("run_id", run.id)
      .eq("step_number", step.number);
    await loadSteps(run.id);
  };

  // --- Encerrar rodada -----------------------------------------------------
  const finishRun = async () => {
    if (!run) return;
    await supabase
      .from("pdv_tef_homologation_runs")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", run.id);
    toast({ title: "Rodada encerrada" });
    await loadActiveRun(storeId);
  };

  // --- Export XLSX ---------------------------------------------------------
  const handleExport = () => {
    if (!run) return;
    const storeName = stores.find((s) => s.id === storeId)?.name ?? "";
    const rows: StepResultRow[] = steps.map((s) => ({
      step_number: s.step_number,
      status: s.status,
      nsu: s.nsu,
      requnum: s.requnum,
      observations: s.observations,
    }));
    exportHomologationXlsx(rows, {
      startedAt: new Date(run.started_at).toLocaleString("pt-BR"),
      pdcCode: run.pdc_code,
      storeName,
    });
  };

  const progress = useMemo(() => {
    const total = steps.length || HOMOLOGATION_STEPS.length;
    const done = steps.filter((s) => s.status !== "pending").length;
    const ok = steps.filter((s) => s.status === "ok").length;
    return { total, done, ok };
  }, [steps]);

  const stepByNumber = (n: number) => steps.find((s) => s.step_number === n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Homologação PayGo
        </h1>
        <p className="text-muted-foreground">
          Execute o roteiro Setis v20241216 (54 passos) contra o NEXA ACBr Agent e exporte
          a planilha de retorno pronta para envio.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Loja piloto</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ponto de Captura</Label>
            <Input value={pdcCode} onChange={(e) => setPdcCode(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Host PayGo</Label>
            <Input value={hostUrl} onChange={(e) => setHostUrl(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!run && (
            <Button onClick={createRun} disabled={!storeId}>
              <Plus className="h-4 w-4 mr-1" /> Iniciar nova rodada
            </Button>
          )}
          {run && (
            <>
              <Button variant="outline" onClick={() => loadSteps(run.id)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" /> Exportar XLSX
              </Button>
              <Button variant="destructive" onClick={finishRun}>
                Encerrar rodada
              </Button>
            </>
          )}
        </div>

        {run && (
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Rodada iniciada em {new Date(run.started_at).toLocaleString("pt-BR")}</span>
            <span>Progresso: {progress.done}/{progress.total} ({progress.ok} OK)</span>
          </div>
        )}
      </Card>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !run ? (
        <Card className="p-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
          Nenhuma rodada aberta. Clique em "Iniciar nova rodada" para começar.
        </Card>
      ) : (
        <div className="space-y-3">
          {HOMOLOGATION_STEPS.map((s) => {
            const row = stepByNumber(s.number);
            const status = row?.status ?? "pending";
            const busy = busyStep === s.number;
            const isManual = s.kind === "manual" || s.kind === "power-cut" || s.kind === "generic-input" || s.kind === "pending";
            return (
              <Card key={s.number} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">Passo {s.number}</span>
                      <span className="text-muted-foreground">— {s.name}</span>
                      {s.mandatory ? (
                        <Badge variant="default">Obrigatório</Badge>
                      ) : (
                        <Badge variant="secondary">Opcional</Badge>
                      )}
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                    <p className="text-xs text-muted-foreground italic mt-1">
                      Esperado: {s.expected}
                    </p>
                    {row?.nsu && (
                      <div className="text-xs mt-1 text-foreground">
                        NSU: <code className="bg-muted px-1 rounded">{row.nsu}</code>
                        {row.card_brand && <> · {row.card_brand}</>}
                        {row.authorization_code && <> · Aut {row.authorization_code}</>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {!isManual && s.kind !== "controlpay-na" && (
                      <Button
                        size="sm"
                        onClick={() => executeStep(s)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                        Executar
                      </Button>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline"
                        onClick={() => markStep(s, { status: "ok" })}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => markStep(s, { status: "fail" })}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => markStep(s, { status: "skipped" })}>
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    placeholder="NSU (PWINFO_REQNUM) — preencher manualmente se necessário"
                    defaultValue={row?.nsu ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (row?.nsu ?? "")) void markStep(s, { nsu: v || null, status: row?.status ?? "ok" });
                    }}
                  />
                  <Textarea
                    placeholder="Observações"
                    defaultValue={row?.observations ?? ""}
                    rows={1}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (row?.observations ?? "")) void markStep(s, { observations: v || null, status: row?.status ?? "ok" });
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
