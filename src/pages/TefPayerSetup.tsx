/**
 * /configuracoes/tef-payer — homologação Payer API Localhost
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { checkAcbrAgent } from "@/lib/tef/acbrAdapter";
import { payerDiagnostics, payerLogin, type PayerDiagnostics } from "@/lib/tef/payerAdapter";
import PayerTestSaleCard from "@/components/tef-payer/PayerTestSaleCard";

const AGENT_URL = "https://127.0.0.1:3031";
const PAYER_DOCS = "https://docs.payer.com.br/docs/integrations/api-localhost.html";

export default function TefPayerSetup() {
  const [loading, setLoading] = useState(true);
  const [agentOk, setAgentOk] = useState(false);
  const [agentVersion, setAgentVersion] = useState<string | null>(null);
  const [payer, setPayer] = useState<PayerDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const agent = await checkAcbrAgent(AGENT_URL);
      setAgentOk(!!agent?.ok);
      setAgentVersion(agent?.version ?? null);
      const d = await payerDiagnostics(AGENT_URL);
      setPayer(d);
    } catch (e) {
      setAgentOk(false);
      setPayer(null);
      toast({ title: "Agente indisponível", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onLogin = async () => {
    try {
      const r = await payerLogin(AGENT_URL);
      if (!r?.ok) throw new Error(r?.error || "Login falhou");
      toast({ title: "Login Payer", description: "Sessão iniciada no Checkout." });
      await refresh();
    } catch (e) {
      toast({ title: "Login falhou", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            TEF Payer — Testes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Homologação via API Localhost (Checkout Payer na porta 6060).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Status</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant={agentOk ? "default" : "destructive"}>
            Agente {agentVersion ? `v${agentVersion}` : ""} {agentOk ? "online" : "offline"}
          </Badge>
          <Badge variant={payer?.checkoutReachable ? "default" : "secondary"}>
            Checkout {payer?.checkoutReachable ? "acessível" : "indisponível"}
          </Badge>
          <Badge variant={payer?.loggedIn ? "default" : "outline"}>
            {payer?.loggedIn ? "logado" : "não logado"}
          </Badge>
          <Badge variant={payer?.hasCredentials ? "outline" : "secondary"}>
            credenciais env {payer?.hasCredentials ? "OK" : "faltando"}
          </Badge>
        </div>
        {payer?.baseUrl ? (
          <p className="text-xs font-mono text-muted-foreground">Payer: {payer.baseUrl}</p>
        ) : null}
        {payer?.lastError ? (
          <p className="text-xs text-destructive">{payer.lastError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onLogin}>Login no Checkout</Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={PAYER_DOCS} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Documentação
            </a>
          </Button>
        </div>
      </Card>

      <PayerTestSaleCard />

      <Card className="p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Setup rápido</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Instale o Checkout Payer e ative modo <strong>Localhost</strong>.</li>
          <li>Defina <code className="text-xs">PAYER_EMAIL</code> e <code className="text-xs">PAYER_PASSWORD</code> antes de subir o agente.</li>
          <li>Reinicie o agente (atalho na área de trabalho ou <code className="text-xs">npm run start:console</code>).</li>
          <li>Veja <code className="text-xs">electron-acbr/SETUP-PAYER.md</code> no repositório.</li>
        </ol>
      </Card>
    </div>
  );
}
