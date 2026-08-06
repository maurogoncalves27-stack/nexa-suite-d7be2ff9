/**
 * /configuracoes/smartpos — configuração do terminal SmartPOS (GPOS780).
 * Define provider TEF por loja, endereço do serviço local (Payer API Localhost),
 * número lógico do terminal e a impressora da bobina.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tablet, Loader2, Printer, PlugZap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig } from "@/lib/tef";
import { payerDiagnostics } from "@/lib/tef/payer";
import {
  DEFAULT_PAYER_DIRECT_URL,
  getPayerDirectUrl,
  isNativeShell,
  resolvePayerTransport,
  setPayerDirectUrl,
  setPayerTransport,
  type PayerTransportMode,
} from "@/lib/tef/payer/transport";
import {
  getSmartPosPrinterUrl,
  setSmartPosPrinterUrl,
  isNativePrinterAvailable,
  printSmartPosText,
} from "@/lib/smartpos/print";

interface Store { id: string; name: string }

const PROVIDERS = [
  { value: "payer", label: "Payer (API Localhost)" },
  { value: "paygo", label: "PayGo Integrado" },
  { value: "mock", label: "Simulação (mock)" },
];

const DEFAULT_SMARTPOS_URL = DEFAULT_PAYER_DIRECT_URL;

const TRANSPORTS: { value: PayerTransportMode | "auto"; label: string }[] = [
  { value: "auto", label: "Automático (recomendado)" },
  { value: "direct", label: "Direto no aparelho (APK Android)" },
  { value: "agent", label: "Via agente NEXA (PC Windows)" },
];

export default function SmartPosConfig() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [provider, setProvider] = useState("payer");
  const [agentUrl, setAgentUrl] = useState(DEFAULT_SMARTPOS_URL);
  const [terminalCode, setTerminalCode] = useState("");
  const [merchantCode, setMerchantCode] = useState("");
  const [printerUrl, setPrinterUrl] = useState(getSmartPosPrinterUrl());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  const [transport, setTransport] = useState<PayerTransportMode | "auto">(() => {
    try {
      const v = localStorage.getItem("nexa-payer-transport");
      return v === "agent" || v === "direct" ? v : "auto";
    } catch {
      return "auto";
    }
  });

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("stores").select("id, name").eq("is_virtual", false).eq("is_active", true).order("name");
      const list = (data ?? []) as Store[];
      setStores(list);
      if (list.length) setStoreId((prev) => prev || list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!storeId) return;
    void loadTefConfig(storeId).then((cfg) => {
      setProvider(cfg.provider ?? "payer");
      setAgentUrl(cfg.agentUrl || DEFAULT_SMARTPOS_URL);
      setTerminalCode(cfg.terminalCode ?? "");
      setMerchantCode(cfg.merchantCode ?? "");
    });
  }, [storeId]);

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    setSmartPosPrinterUrl(printerUrl.trim());
    setPayerTransport(transport);
    if (resolvePayerTransport() === "direct") setPayerDirectUrl(agentUrl.trim());
    const { data: existing } = await supabase
      .from("pdv_tef_config").select("id").eq("store_id", storeId).maybeSingle();
    const payload = {
      store_id: storeId,
      provider,
      agent_url: agentUrl.trim(),
      terminal_code: terminalCode.trim() || null,
      merchant_code: merchantCode.trim() || null,
      is_active: true,
    };
    const { error } = existing?.id
      ? await supabase.from("pdv_tef_config").update(payload).eq("id", existing.id)
      : await supabase.from("pdv_tef_config").insert(payload);
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else toast({ title: "Configuração salva" });
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("");
    try {
      if (provider === "payer") {
        setPayerTransport(transport);
        if (resolvePayerTransport() === "direct") setPayerDirectUrl(agentUrl.trim());
        const d = await payerDiagnostics(agentUrl.trim());
        setTestResult(
          d.checkoutReachable
            ? `Checkout acessível${d.loggedIn ? " · sessão ativa" : " · sem login"}`
            : `Sem resposta em ${agentUrl}`,
        );
      } else {
        const r = await fetch(`${agentUrl.replace(/\/+$/, "")}/health`, {
          signal: AbortSignal.timeout(4000),
        });
        setTestResult(r.ok ? "Agente respondeu /health" : `HTTP ${r.status}`);
      }
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Falha na conexão");
    } finally {
      setTesting(false);
    }
  };

  const testPrint = async () => {
    setSmartPosPrinterUrl(printerUrl.trim());
    const r = await printSmartPosText(
      ["NEXA SUITE", "Teste de impressao SmartPOS", new Date().toLocaleString("pt-BR"), "", ""].join("\n"),
    );
    toast({
      title: r.ok ? `Impressão enviada (${r.via})` : "Falha ao imprimir",
      description: r.error,
      variant: r.ok ? undefined : "destructive",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Tablet className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Terminal SmartPOS
        </h1>
        <p className="text-muted-foreground">
          Configuração do TEF e da impressora das maquininhas SmartPOS e do NEXA Garçom.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>TEF por loja</CardTitle>
          <CardDescription>
            No SmartPOS o app roda dentro do aparelho e fala com o Payer pela API Localhost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Provider TEF</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Endereço do serviço local</Label>
              <Input value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} placeholder={DEFAULT_SMARTPOS_URL} />
            </div>
            <div className="space-y-1">
              <Label>Comunicação com o Payer</Label>
              <Select value={transport} onValueChange={(v) => setTransport(v as PayerTransportMode | "auto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSPORTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Detectado agora: {resolvePayerTransport() === "direct" ? "direto no aparelho" : "via agente NEXA"}
                {isNativeShell() ? " (APK)" : ""} · Checkout local: {getPayerDirectUrl()}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Terminal / número lógico</Label>
              <Input value={terminalCode} onChange={(e) => setTerminalCode(e.target.value)} placeholder="Ex.: 111476" />
            </div>
            <div className="space-y-1">
              <Label>Estabelecimento (CNPJ/loja no provedor)</Label>
              <Input value={merchantCode} onChange={(e) => setMerchantCode(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={saving || !storeId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
              Testar conexão
            </Button>
            {testResult && <Badge variant="outline">{testResult}</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />Impressora da bobina
          </CardTitle>
          <CardDescription>
            {isNativePrinterAvailable()
              ? "Impressora nativa do aparelho detectada — nada a configurar."
              : "Sem bridge nativa: informe o serviço HTTP de impressão do aparelho (opcional)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>URL do serviço de impressão</Label>
            <Input
              value={printerUrl}
              onChange={(e) => setPrinterUrl(e.target.value)}
              placeholder="http://127.0.0.1:9100/print"
            />
            <p className="text-xs text-muted-foreground">
              Guardado apenas neste aparelho. Em branco, usa a impressão do navegador.
            </p>
          </div>
          <Button variant="outline" onClick={testPrint}>
            <Printer className="h-4 w-4 mr-2" />Imprimir teste
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
