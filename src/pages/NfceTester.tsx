import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { FileCheck, Wifi, WifiOff, Loader2, Send, Activity, FlaskConical, Terminal, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { buildHomologacaoIni, type StoreNfceCfg } from "@/lib/acbr/nfceIniBuilder";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Health {
  ok: boolean;
  version?: string;
  nfceReady?: boolean;
  nfceVersion?: string | null;
  nfceError?: string | null;
  nfceDiagnostics?: any;
  paths?: any;
  error?: string;
}

const DEFAULT_URL = "http://127.0.0.1:3030";

export default function NfceTester() {
  const [agentUrl, setAgentUrl] = useState(DEFAULT_URL);
  const [health, setHealth] = useState<Health>({ ok: false });
  const [stores, setStores] = useState<StoreNfceCfg[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [iniPreview, setIniPreview] = useState("");
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState<"status" | "emit" | null>(null);
  const [nNF, setNNF] = useState<string>("");

  // Polling /health a cada 5s
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`${agentUrl}/health`, { cache: "no-store" });
        const j = await r.json();
        if (!cancelled) setHealth(j);
      } catch (e: any) {
        if (!cancelled) setHealth({ ok: false, error: e?.message ?? "agente offline" });
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [agentUrl]);

  // Carrega lojas com CNPJ
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, cnpj, legal_name, name, inscricao_estadual, regime_tributario, address, number, neighborhood, city, state, zip_code, nfce_serie, nfce_next_number, nfce_environment")
        .eq("is_virtual", false)
        .not("cnpj", "is", null)
        .order("name");
      const list = (data ?? []) as any[];
      // strip o id pra usar no select; mantemos o id via map externo
      setStores(list as any);
      if (list.length && !storeId) setStoreId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStore = stores.find((s: any) => (s as any).id === storeId) as any;

  const regenerateIni = () => {
    if (!selectedStore) return;
    try {
      const ini = buildHomologacaoIni(selectedStore, {
        numeroNF: nNF ? Number(nNF) : undefined,
      });
      setIniPreview(ini);
    } catch (e: any) {
      toast({ title: "Erro montando INI", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    regenerateIni();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, nNF]);

  const callStatus = async () => {
    setLoading("status");
    setResponse("");
    try {
      const r = await fetch(`${agentUrl}/nfce/status`);
      const j = await r.json();
      setResponse(JSON.stringify(j, null, 2));
      if (!j.ok) toast({ title: "Falha StatusServico", description: j.error, variant: "destructive" });
      else toast({ title: "StatusServico OK", description: "SEFAZ respondeu" });
    } catch (e: any) {
      setResponse(`Erro: ${e.message}`);
      toast({ title: "Agente inacessível", description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const callEmit = async () => {
    if (!iniPreview) {
      toast({ title: "INI vazio", description: "Selecione uma loja primeiro", variant: "destructive" });
      return;
    }
    if (!selectedStore) return;
    if (selectedStore.nfce_environment !== "homologacao") {
      const ok = window.confirm(
        "Loja está em PRODUÇÃO. A NFC-e emitida será REAL e fiscal. Continuar?",
      );
      if (!ok) return;
    }

    setLoading("emit");
    setResponse("");
    try {
      const r = await fetch(`${agentUrl}/nfce/emitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iniContent: iniPreview, imprimir: false, sincrono: true }),
      });
      const j = await r.json();
      setResponse(JSON.stringify(j, null, 2));
      if (j.ok) toast({ title: "Resposta recebida", description: "Veja o retorno abaixo (procure cStat=100)" });
      else toast({ title: "Falha na emissão", description: j.error, variant: "destructive" });
    } catch (e: any) {
      setResponse(`Erro: ${e.message}`);
      toast({ title: "Agente inacessível", description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Teste NFC-e (ACBr)
        </h1>
        <p className="text-muted-foreground">
          Teste ponta-a-ponta de emissão de NFC-e via agente NEXA-ACBr local (porta 3030).
        </p>
      </div>

      {/* Agente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Agente local
          </CardTitle>
          <CardDescription>Status do NEXA-ACBr rodando na máquina do PDV.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label>URL do agente</Label>
              <Input value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} />
            </div>
            <div>
              {health.ok ? (
                <Badge variant="secondary" className="bg-success/10 text-success border-success/20 gap-1">
                  <Wifi className="h-3 w-3" /> Online v{health.version}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                  <WifiOff className="h-3 w-3" /> {health.error ?? "offline"}
                </Badge>
              )}
            </div>
            <TerminalDialog agentUrl={agentUrl} />
          </div>

          {health.ok && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">NFC-e pronto: </span>
                {health.nfceReady ? (
                  <span className="text-success font-medium">sim (v{health.nfceVersion || "?"})</span>
                ) : (
                  <span className="text-destructive font-medium">não — {health.nfceError}</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">DLL: </span>
                <code className="text-xs">{health.paths?.DLL_PATH}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status SEFAZ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Consultar StatusServico SEFAZ</CardTitle>
          <CardDescription>
            Confirma que o certificado A1 está carregado e a SEFAZ está respondendo (cStat=107).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={callStatus} disabled={loading !== null || !health.nfceReady}>
            {loading === "status" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Consultar SEFAZ
          </Button>
        </CardContent>
      </Card>

      {/* Emissão */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Emitir NFC-e de teste (R$ 0,01)</CardTitle>
          <CardDescription>
            Monta um INI mínimo válido e envia para o agente. Em homologação a nota não tem valor fiscal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Loja emitente</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(stores as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {s.nfce_environment === "producao" ? "PRODUÇÃO" : "homologação"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>nNF (opcional, força um número)</Label>
              <Input
                type="number"
                placeholder={`auto (próximo da loja: ${selectedStore?.nfce_next_number ?? "?"})`}
                value={nNF}
                onChange={(e) => setNNF(e.target.value)}
              />
            </div>
          </div>

          {selectedStore && (
            <div className="text-xs text-muted-foreground">
              CNPJ {selectedStore.cnpj} · IE {selectedStore.inscricao_estadual || "ISENTO"} ·
              CRT {selectedStore.regime_tributario === 3 ? "3 (Normal)" : "1 (Simples)"} ·
              série {selectedStore.nfce_serie || 1}
            </div>
          )}

          <div>
            <Label>INI gerado</Label>
            <Textarea
              value={iniPreview}
              onChange={(e) => setIniPreview(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Você pode editar antes de enviar para testar variações.
            </p>
          </div>

          <Button onClick={callEmit} disabled={loading !== null || !health.nfceReady}>
            {loading === "emit" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Emitir NFC-e
          </Button>
        </CardContent>
      </Card>

      {/* Retorno */}
      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-4 w-4 text-primary" />
              Retorno do agente
            </CardTitle>
            <CardDescription>
              Procure por <code>cStat=100</code> (autorizada) ou <code>cStat=107</code> (status).
              Códigos diferentes indicam rejeição — confira xMotivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea readOnly value={response} rows={18} className="font-mono text-xs" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
