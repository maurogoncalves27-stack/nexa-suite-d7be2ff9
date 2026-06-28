/**
 * Checklist de homologação Payer — independente do PayGo.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { checkPayerAgent } from "@/lib/tef/payer";

type CheckState = "ok" | "warn" | "fail" | "pending";

interface CheckItem {
  label: string;
  state: CheckState;
  detail?: string;
}

const icon = (state: CheckState) => {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />;
};

interface Props {
  agentUrl: string;
}

export default function PayerHomologationChecklist({ agentUrl }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CheckItem[]>([]);

  const run = useCallback(async () => {
    setLoading(true);
    const checks: CheckItem[] = [];

    const agent = await checkPayerAgent(agentUrl);
    checks.push({
      label: "Agente NEXA online",
      state: agent.online ? "ok" : "fail",
      detail: agent.version ? `v${agent.version}` : agent.error,
    });
    checks.push({
      label: "Checkout Payer acessível (:6060)",
      state: agent.checkoutReachable ? "ok" : "fail",
      detail: agent.baseUrl ?? "http://127.0.0.1:6060",
    });
    checks.push({
      label: "Credenciais PAYER_EMAIL/PASSWORD",
      state: agent.hasCredentials ? "ok" : "warn",
      detail: agent.hasCredentials ? "Configuradas no agente" : "Defina no env antes de subir o agente",
    });
    checks.push({
      label: "Sessão Checkout",
      state: agent.loggedIn ? "ok" : "warn",
      detail: agent.loggedIn ? "Logado" : "Use Login no Checkout ou botão abaixo",
    });

    setItems(checks);
    setLoading(false);
  }, [agentUrl]);

  useEffect(() => { void run(); }, [run]);

  const allOk = items.length > 0 && items.every((i) => i.state === "ok");
  const hasFail = items.some((i) => i.state === "fail");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Checklist homologação</h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Badge variant={allOk ? "default" : hasFail ? "destructive" : "secondary"}>
              {allOk ? "pronto" : hasFail ? "bloqueado" : "atenção"}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            {icon(item.state)}
            <div className="min-w-0">
              <div>{item.label}</div>
              {item.detail ? (
                <div className="text-xs text-muted-foreground truncate">{item.detail}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
