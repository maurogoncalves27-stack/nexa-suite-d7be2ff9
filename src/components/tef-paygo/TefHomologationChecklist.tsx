/**
 * Checklist visual de homologação PayGo.
 * Mostra o estado atual de cada pré-requisito (config TEF, agente local,
 * DLL detectada, último teste aprovado) na ordem oficial Setis.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, ListChecks } from "lucide-react";
import { checkAcbrAgent } from "@/lib/tef/acbrAdapter";

interface Props { storeId: string }

type CheckState = "ok" | "warn" | "fail" | "pending";

interface CheckItem {
  label: string;
  state: CheckState;
  detail?: string;
}

const Dot = ({ state }: { state: CheckState }) => {
  if (state === "ok") return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
  if (state === "warn") return <AlertTriangle className="h-5 w-5 text-warning shrink-0" />;
  if (state === "fail") return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
  return <Loader2 className="h-5 w-5 text-muted-foreground animate-spin shrink-0" />;
};

export default function TefHomologationChecklist({ storeId }: Props) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const next: CheckItem[] = [];

    // 1. Config TEF da loja
    if (!storeId) {
      next.push({ label: "1. Loja selecionada", state: "warn", detail: "Selecione uma loja acima para rodar o checklist." });
      setItems(next);
      setLoading(false);
      return;
    }
    next.push({ label: "1. Loja selecionada", state: "ok" });

    const { data: cfg } = await supabase
      .from("pdv_tef_config")
      .select("provider, agent_url, environment, merchant_code, terminal_code, is_active")
      .eq("store_id", storeId)
      .maybeSingle();

    if (!cfg) {
      next.push({ label: "2. Config TEF cadastrada", state: "fail", detail: "Sem registro em pdv_tef_config. Configure em PDV → TEF." });
      setItems(next);
      setLoading(false);
      return;
    }
    next.push({
      label: "2. Config TEF cadastrada",
      state: cfg.is_active ? "ok" : "warn",
      detail: cfg.is_active ? `provider=${cfg.provider}` : "TEF inativo nesta loja",
    });

    // 3. Ambiente correto (DEMO p/ homologação)
    next.push({
      label: "3. Ambiente em DEMO (sandbox)",
      state: cfg.environment === "demo" ? "ok" : "warn",
      detail: cfg.environment === "demo"
        ? "Ambiente correto para homologação."
        : `Ambiente atual: ${cfg.environment}. Use DEMO até homologar.`,
    });

    // 4. CNPJ + PdC preenchidos
    const credsOk = !!cfg.merchant_code && !!cfg.terminal_code;
    next.push({
      label: "4. CNPJ + Ponto de Captura preenchidos",
      state: credsOk ? "ok" : "warn",
      detail: credsOk ? `PdC=${cfg.terminal_code}` : "Em DEMO é opcional, mas recomendado preencher.",
    });

    // 5. Agente local online
    const agent = await checkAcbrAgent(cfg.agent_url ?? "https://127.0.0.1:3031");
    next.push({
      label: "5. Agente local online",
      state: agent.ok ? "ok" : "fail",
      detail: agent.ok
        ? `${agent.mode ?? "agente"} v${agent.version ?? "?"}`
        : (agent.error ?? "Sem resposta. Instale/abra o NEXA ACBr Agent na máquina do PDV."),
    });

    // 6. PGWebLib inicializada
    next.push({
      label: "6. PGWebLib.dll carregada",
      state: agent.ok ? "ok" : "fail",
      detail: agent.ok
        ? "DLL inicializada pelo agente."
        : "Quando o agente subir, ele inicializa a DLL na pasta homologacao/.",
    });

    // 7. Última transação aprovada
    const { data: lastOk } = await supabase
      .from("pdv_tef_transactions")
      .select("amount, finished_at, nsu")
      .eq("store_id", storeId)
      .eq("status", "approved")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    next.push({
      label: "7. Pelo menos 1 venda aprovada",
      state: lastOk ? "ok" : "warn",
      detail: lastOk
        ? `R$ ${Number(lastOk.amount).toFixed(2)} • NSU ${lastOk.nsu ?? "—"} • ${new Date(lastOk.finished_at as string).toLocaleString("pt-BR")}`
        : "Rode a venda de teste R$ 1,00 acima.",
    });

    setItems(next);
    setLoading(false);
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const total = items.length;
  const okCount = items.filter(i => i.state === "ok").length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Checklist de homologação
        </h2>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Badge variant={okCount === total ? "default" : "secondary"}>
              {okCount}/{total} OK
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Revalidar
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5">
            <Dot state={it.state} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{it.label}</div>
              {it.detail && (
                <div className="text-xs text-muted-foreground break-words">{it.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Use este checklist antes de cada rodada de homologação. Se algum item estiver <strong>vermelho</strong>,
        resolva antes de chamar a Setis.
      </p>
    </Card>
  );
}
