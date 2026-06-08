import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Loader2, Save, Wifi, WifiOff, PlayCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { checkSitefAgent } from "@/lib/tef/sitefAdapter";
import { checkAcbrAgent } from "@/lib/tef/acbrAdapter";
import { TefPaymentDialog } from "@/components/tef/TefPaymentDialog";
import type { TefConfig, TefPaymentRequest } from "@/lib/tef";

interface Store { id: string; name: string }

interface TefCfg {
  id?: string;
  store_id: string;
  provider: "sitef" | "paygo" | "mock" | "acbr";
  agent_url: string;
  merchant_code: string | null;
  terminal_code: string | null;
  acquirer: string | null;
  is_active: boolean;
  environment: "demo" | "producao";
}

const DEFAULT_AGENT_URL: Record<TefCfg["provider"], string> = {
  mock: "http://localhost:60906",
  sitef: "http://localhost:60906",
  paygo: "http://localhost:60906",
  acbr: "https://127.0.0.1:3031",
};

const blank = (storeId: string): TefCfg => ({
  store_id: storeId,
  provider: "mock",
  agent_url: "http://localhost:60906",
  merchant_code: "",
  terminal_code: "",
  acquirer: "",
  is_active: true,
  environment: "demo",
});

export default function TefConfigPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [cfg, setCfg] = useState<TefCfg | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<{ ok: boolean; mode?: string; version?: string; error?: string }>({ ok: false });
  const [testReq, setTestReq] = useState<TefPaymentRequest | null>(null);
  const [testConfig, setTestConfig] = useState<TefConfig | null>(null);

  // Polling de saúde do agente local (a cada 5s enquanto montado)
  useEffect(() => {
    if (!cfg?.agent_url) return;
    let cancelled = false;
    const tick = async () => {
      const r = cfg.provider === "acbr"
        ? await checkAcbrAgent(cfg.agent_url)
        : await checkSitefAgent(cfg.agent_url);
      if (!cancelled) setAgent(r);
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [cfg?.agent_url, cfg?.provider]);

  useEffect(() => {
    void (async () => {
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
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("pdv_tef_config")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      setCfg((data as TefCfg) ?? blank(storeId));
      setLoading(false);
    })();
  }, [storeId]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const isProd = cfg.environment === "producao";
    if (isProd && (!cfg.merchant_code || !cfg.terminal_code)) {
      setSaving(false);
      toast({
        title: "Credenciais obrigatórias em Produção",
        description: "Informe o código da loja (PV) e do terminal antes de salvar em modo Produção.",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      store_id: cfg.store_id,
      provider: cfg.provider,
      agent_url: cfg.agent_url,
      merchant_code: cfg.merchant_code || null,
      terminal_code: cfg.terminal_code || null,
      acquirer: cfg.acquirer || null,
      is_active: cfg.is_active,
      environment: cfg.environment,
    };
    const { error } = cfg.id
      ? await supabase.from("pdv_tef_config").update(payload).eq("id", cfg.id)
      : await supabase.from("pdv_tef_config").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar TEF", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuração TEF salva" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> TEF (pinpad)
        </CardTitle>
        <CardDescription>
          Configure o provedor de pagamento por loja. Use <Badge variant="secondary">mock</Badge> para
          testes sem hardware. Em produção, instale o agente local (SiTef/PayGo) na máquina do totem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Loja</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading && <Loader2 className="animate-spin" />}

        {cfg && !loading && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              {agent.ok ? (
                <>
                  <Wifi className="h-4 w-4 text-success" />
                  <span className="text-sm">
                    {cfg.provider === "acbr" ? "NEXA ACBr Agent online" : "Agente SiTef online"}
                  </span>
                  {agent.mode && <Badge variant="secondary">modo: {agent.mode}</Badge>}
                  {agent.version && <Badge variant="outline">v{agent.version}</Badge>}
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-destructive" />
                  <span className="text-sm">
                    {cfg.provider === "acbr" ? "NEXA ACBr Agent offline" : "Agente SiTef offline"}
                  </span>
                  <span className="text-xs text-muted-foreground">{agent.error ?? "sem resposta em " + cfg.agent_url}</span>
                </>
              )}
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ambiente</Label>
                <Badge variant={cfg.environment === "producao" ? "default" : "secondary"}>
                  {cfg.environment === "producao" ? "Produção" : "Demo (sandbox)"}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Demo</span>
                <Switch
                  checked={cfg.environment === "producao"}
                  onCheckedChange={(v) => setCfg({ ...cfg, environment: v ? "producao" : "demo" })}
                />
                <span className="text-xs text-muted-foreground">Produção</span>
              </div>
              <p className="basis-full text-xs text-muted-foreground">
                Em <strong>Demo</strong>, o PayGo deve estar em modo sandbox (tela roxa via Ativação → ambiente <code>demo</code>). Não exige CNPJ/PV/senha reais — use para homologação.
              </p>
            </div>

            <div>
              <Label>Provedor TEF</Label>
              <Select
                value={cfg.provider}
                onValueChange={(v) => {
                  const provider = v as TefCfg["provider"];
                  const currentIsDefault = Object.values(DEFAULT_AGENT_URL).includes(cfg.agent_url);
                  setCfg({
                    ...cfg,
                    provider,
                    agent_url: currentIsDefault ? DEFAULT_AGENT_URL[provider] : cfg.agent_url,
                  });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">Mock (simulação)</SelectItem>
                  <SelectItem value="sitef">SiTef (Software Express)</SelectItem>
                  <SelectItem value="acbr">ACBr (PayGo / C6)</SelectItem>
                  <SelectItem value="paygo">PayGo direto (em breve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL do agente local</Label>
              <Input value={cfg.agent_url} onChange={e => setCfg({ ...cfg, agent_url: e.target.value })}
                placeholder={DEFAULT_AGENT_URL[cfg.provider]} />
              {cfg.provider === "acbr" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Requer o <strong>NEXA ACBr Agent</strong> rodando na máquina do totem (porta 3030, ACBrLibTEFD + PayGo Integrado).
                </p>
              )}
            </div>
            <div>
              <Label>
                Código da loja (PV){" "}
                {cfg.environment === "demo" && <span className="text-xs text-muted-foreground">(opcional em demo)</span>}
              </Label>
              <Input value={cfg.merchant_code ?? ""} onChange={e => setCfg({ ...cfg, merchant_code: e.target.value })}
                placeholder={cfg.environment === "demo" ? "Não obrigatório no sandbox" : ""} />
            </div>
            <div>
              <Label>
                Código do terminal{" "}
                {cfg.environment === "demo" && <span className="text-xs text-muted-foreground">(opcional em demo)</span>}
              </Label>
              <Input value={cfg.terminal_code ?? ""} onChange={e => setCfg({ ...cfg, terminal_code: e.target.value })}
                placeholder={cfg.environment === "demo" ? "Não obrigatório no sandbox" : ""} />
            </div>
            <div>
              <Label>Adquirente principal</Label>
              <Input value={cfg.acquirer ?? ""} onChange={e => setCfg({ ...cfg, acquirer: e.target.value })}
                placeholder="C6 Pay, Cielo, Rede..." />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={cfg.is_active} onCheckedChange={(v) => setCfg({ ...cfg, is_active: v })} />
              <Label>TEF ativo nesta loja</Label>
            </div>

            <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTestConfig({
                    provider: cfg.provider,
                    agentUrl: cfg.agent_url,
                    merchantCode: cfg.merchant_code ?? undefined,
                    terminalCode: cfg.terminal_code ?? undefined,
                    acquirer: cfg.acquirer ?? undefined,
                  });
                  setTestReq({ amount: 1, method: "credit", storeId: cfg.store_id, orderId: `test_${Date.now()}` });
                }}
                disabled={!cfg.is_active}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Testar crédito R$ 1,00
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTestConfig({
                    provider: cfg.provider,
                    agentUrl: cfg.agent_url,
                    merchantCode: cfg.merchant_code ?? undefined,
                    terminalCode: cfg.terminal_code ?? undefined,
                    acquirer: cfg.acquirer ?? undefined,
                  });
                  setTestReq({ amount: 1, method: "pix", storeId: cfg.store_id, orderId: `test_${Date.now()}` });
                }}
                disabled={!cfg.is_active}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Testar PIX R$ 1,00
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <TefPaymentDialog
        open={!!testReq}
        request={testReq}
        configOverride={testConfig}
        onClose={() => { setTestReq(null); setTestConfig(null); }}
        onResult={(r) => {
          toast({
            title: r.status === "approved" ? "Teste aprovado" : `Teste: ${r.status}`,
            description: r.message,
            variant: r.status === "approved" ? "default" : "destructive",
          });
        }}
      />
    </Card>
  );
}
