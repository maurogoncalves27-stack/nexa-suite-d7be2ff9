/**
 * /configuracoes/tef-paygo
 * Painel simplificado para testes PayGo — credenciais, pinpad, venda de teste e extrator.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Copy, Pencil, Save, X, KeyRound,
  ListChecks, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { checkAcbrAgent } from "@/lib/tef/acbrAdapter";

import TefTestSaleCard from "@/components/tef-paygo/TefTestSaleCard";
import TefPinpadSetupCard from "@/components/tef-paygo/TefPinpadSetupCard";
import TefRecnumExtractor from "@/components/tef-paygo/TefRecnumExtractor";
import SimulatedPrinter from "@/components/tef-paygo/SimulatedPrinter";
import TefRoteiroTestesCard from "@/components/tef-paygo/TefRoteiroTestesCard";

const DEFAULT_PDC = "111476";
const DEFAULT_HOST = "pos-transac-sb.tpgweb.io:31735";
const DEFAULT_CNPJ = "44.932.369/0001-08";

interface Store { id: string; name: string; }
interface TefRow {
  store_id: string;
  cnpj: string | null;
  pdc: string | null;
  host: string | null;
}

const copy = (v: string, label: string) => {
  navigator.clipboard.writeText(v).then(() => {
    toast({ title: "Copiado", description: `${label} copiado para a área de transferência.` });
  });
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2">
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-mono truncate">{value}</div>
    </div>
    <Button variant="ghost" size="sm" onClick={() => copy(value, label)} className="shrink-0 h-6 w-6 p-0">
      <Copy className="h-3 w-3" />
    </Button>
  </div>
);

const TefPaygoSetup = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("fcf435c2-c382-444c-b499-4d95f07b2633");
  const [cfg, setCfg] = useState<TefRow | null>(null);
  const [editingPdc, setEditingPdc] = useState(false);
  const [pdcDraft, setPdcDraft] = useState("");
  const [savingPdc, setSavingPdc] = useState(false);
  const [editingHost, setEditingHost] = useState(false);
  const [hostDraft, setHostDraft] = useState("");
  const [savingHost, setSavingHost] = useState(false);

  /* checklist inline (ex-TefHomologationChecklist) */
  type CheckState = "ok" | "warn" | "fail" | "pending";
  interface CheckItem { label: string; state: CheckState; detail?: string; }
  const [items, setItems] = useState<CheckItem[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);

  const Dot = ({ state }: { state: CheckState }) => {
    if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
    if (state === "warn") return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
    if (state === "fail") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />;
  };

  const runChecklist = async () => {
    setCheckLoading(true);
    const next: CheckItem[] = [];

    if (!storeId) {
      next.push({ label: "Loja selecionada", state: "warn", detail: "Selecione uma loja." });
      setItems(next);
      setCheckLoading(false);
      return;
    }
    next.push({ label: "Loja selecionada", state: "ok" });

    const { data: cfgRow } = await supabase
      .from("pdv_tef_config")
      .select("provider, agent_url, environment, merchant_code, terminal_code, is_active")
      .eq("store_id", storeId)
      .maybeSingle();

    if (!cfgRow) {
      next.push({ label: "Config TEF cadastrada", state: "fail", detail: "Sem registro em pdv_tef_config." });
      setItems(next);
      setCheckLoading(false);
      return;
    }
    next.push({
      label: "Config TEF cadastrada",
      state: cfgRow.is_active ? "ok" : "warn",
      detail: cfgRow.is_active ? `provider=${cfgRow.provider}` : "TEF inativo nesta loja",
    });

    next.push({
      label: "Ambiente em DEMO",
      state: cfgRow.environment === "demo" ? "ok" : "warn",
      detail: cfgRow.environment === "demo" ? "OK" : `Atual: ${cfgRow.environment}. Use DEMO.`,
    });

    const credsOk = !!cfgRow.merchant_code && !!cfgRow.terminal_code;
    next.push({
      label: "CNPJ + PdC preenchidos",
      state: credsOk ? "ok" : "warn",
      detail: credsOk ? `PdC=${cfgRow.terminal_code}` : "Recomendado preencher.",
    });

    const agent = await checkAcbrAgent(cfgRow.agent_url ?? "https://127.0.0.1:3031");
    next.push({
      label: "Agente local online",
      state: agent.online ? "ok" : "fail",
      detail: agent.online ? "Agente respondeu" : (agent.error ?? "Sem resposta."),
    });

    next.push({
      label: "PGWebLib.dll carregada",
      state: agent.ok ? "ok" : "fail",
      detail: agent.ok ? "DLL inicializada" : (agent.error ?? "Não inicializada."),
    });

    const { data: lastOk } = await supabase
      .from("pdv_tef_transactions")
      .select("amount, finished_at, nsu")
      .eq("store_id", storeId)
      .eq("status", "approved")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    next.push({
      label: "Pelo menos 1 venda aprovada",
      state: lastOk ? "ok" : "warn",
      detail: lastOk
        ? `R$ ${Number(lastOk.amount).toFixed(2)} \u2022 NSU ${lastOk.nsu ?? "\u2014"} \u2022 ${new Date(lastOk.finished_at as string).toLocaleString("pt-BR")}`
        : "Rode a venda de teste R$ 1,00.",
    });

    setItems(next);
    setCheckLoading(false);
  };

  useEffect(() => { void runChecklist(); /* eslint-disable-next-line */ }, [storeId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id,name")
        .eq("is_virtual", false)
        .order("name");
      setStores((data ?? []) as Store[]);
    })();
  }, []);

  useEffect(() => {
    if (!storeId) { setCfg(null); return; }
    (async () => {
      const { data } = await supabase
        .from("pdv_tef_config")
        .select("store_id,merchant_code,terminal_code,agent_url")
        .eq("store_id", storeId)
        .maybeSingle();
      if (!data) { setCfg(null); return; }
      setCfg({
        store_id: data.store_id,
        cnpj: data.merchant_code,
        pdc: data.terminal_code,
        host: data.agent_url,
      });
    })();
  }, [storeId]);

  const cnpj = cfg?.cnpj || DEFAULT_CNPJ;
  const pdc = cfg?.pdc || DEFAULT_PDC;
  const host = cfg?.host || DEFAULT_HOST;

  return (
    <div className="space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          TEF PayGo — Testes
        </h1>
        <p className="text-muted-foreground text-sm">
          Painel rápido para validar transações e configuração do pinpad.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start min-h-0">
        {/* Coluna principal */}
        <div className="space-y-4 min-h-0">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">Credenciais desta loja</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Loja</label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            <Badge variant="outline" className="h-fit text-xs">
              {cfg ? "Configuração encontrada" : "Padrão (sandbox)"}
            </Badge>
          </div>
            <div className="grid gap-2 sm:grid-cols-3 pt-1">
              <Field label="CNPJ" value={cnpj} />
              <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Ponto de Captura (PdC)</div>
                  {!editingPdc ? (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => copy(pdc, "Ponto de Captura")} className="h-7 w-7 p-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!storeId}
                        onClick={() => { setPdcDraft(pdc); setEditingPdc(true); }}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingPdc}
                        onClick={async () => {
                          if (!storeId) return;
                          const trimmed = pdcDraft.trim();
                          if (!trimmed) {
                            toast({ title: "PdC inválido", description: "Informe um Ponto de Captura.", variant: "destructive" });
                            return;
                          }
                          setSavingPdc(true);
                          const { error } = await supabase
                            .from("pdv_tef_config")
                            .update({ terminal_code: trimmed })
                            .eq("store_id", storeId);
                          setSavingPdc(false);
                          if (error) {
                            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
                            return;
                          }
                          setCfg(prev => prev ? { ...prev, pdc: trimmed } : prev);
                          setEditingPdc(false);
                          toast({ title: "PdC atualizado", description: `Ponto de Captura: ${trimmed}` });
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingPdc}
                        onClick={() => setEditingPdc(false)}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingPdc ? (
                  <Input
                    autoFocus
                    value={pdcDraft}
                    onChange={(e) => setPdcDraft(e.target.value)}
                    className="h-7 font-mono text-sm"
                    placeholder="Ex.: 111476"
                  />
                ) : (
                  <div className="text-sm font-mono truncate">{pdc}</div>
                )}
              </div>
              <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">Host (sandbox)</div>
                  {!editingHost ? (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => copy(host, "Host")} className="h-7 w-7 p-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!storeId}
                        onClick={() => { setHostDraft(host); setEditingHost(true); }}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingHost}
                        onClick={async () => {
                          if (!storeId) return;
                          const trimmed = hostDraft.trim();
                          if (!trimmed) {
                            toast({ title: "Host inválido", description: "Informe um endereço.", variant: "destructive" });
                            return;
                          }
                          setSavingHost(true);
                          const { error } = await supabase
                            .from("pdv_tef_config")
                            .update({ agent_url: trimmed })
                            .eq("store_id", storeId);
                          setSavingHost(false);
                          if (error) {
                            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
                            return;
                          }
                          setCfg(prev => prev ? { ...prev, host: trimmed } : prev);
                          setEditingHost(false);
                          toast({ title: "Host atualizado", description: trimmed });
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingHost}
                        onClick={() => setEditingHost(false)}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingHost ? (
                  <Input
                    autoFocus
                    value={hostDraft}
                    onChange={(e) => setHostDraft(e.target.value)}
                    className="h-7 font-mono text-sm"
                    placeholder="https://127.0.0.1:3031"
                  />
                ) : (
                  <div className="text-sm font-mono truncate">{host}</div>
                )}
              </div>
            </div>

            {/* Checklist inline */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {items.length > 0 && (
                  <Badge variant={items.filter(i => i.state === "ok").length === items.length ? "default" : "secondary"} className="text-[10px] h-5">
                    {items.filter(i => i.state === "ok").length}/{items.length} OK
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] h-5">Agente v1.5.5</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 text-[11px] gap-1"
                  title="Baixar agente ACBr (v1.5.5)"
                >
                  <a href="/releases/NEXA-ACBr-Agent-Setup-1.5.5.exe" download>
                    <Download className="h-3.5 w-3.5" />
                    Baixar agente
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void runChecklist()} disabled={checkLoading} className="h-7 w-7 p-0">
                  {checkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {items.filter(i => i.state !== "ok").length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Tudo certo. Use o botão <strong>Abrir menu ADM</strong> e a <strong>Venda de teste</strong> para validar o pinpad.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {items.filter(i => i.state !== "ok").map((it, idx) => (
                    <Badge
                      key={idx}
                      variant={it.state === "fail" ? "destructive" : "outline"}
                      className="text-[10px] h-5 gap-1"
                      title={it.detail}
                    >
                      <Dot state={it.state} />
                      {it.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          

          <TefPinpadSetupCard
            storeId={storeId}
            cpfCnpj={cnpj}
            pontoDeCaptura={pdc}
            sandboxHost={DEFAULT_HOST}
          />

          <TefTestSaleCard />

          <TefRoteiroTestesCard />

          <TefRecnumExtractor storeId={storeId} />
        </div>

        {/* Coluna lateral — impressora (altura total) */}
        <div className="h-full">
          <div className="lg:sticky lg:top-4 h-[calc(100vh-7rem)]">
            <SimulatedPrinter />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TefPaygoSetup;
