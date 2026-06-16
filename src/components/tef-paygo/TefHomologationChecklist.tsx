/**
 * Checklist compacto de homologação PayGo.
 * Mostra apenas o resumo de status e os itens com problema.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, ListChecks, Download } from "lucide-react";
import { checkAcbrAgent } from "@/lib/tef/acbrAdapter";

interface Props { storeId: string }

type CheckState = "ok" | "warn" | "fail" | "pending";

interface CheckItem {
  label: string;
  state: CheckState;
  detail?: string;
}

const Dot = ({ state }: { state: CheckState }) => {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />;
};

export default function TefHomologationChecklist({ storeId }: Props) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const next: CheckItem[] = [];

    if (!storeId) {
      next.push({ label: "Loja selecionada", state: "warn", detail: "Selecione uma loja." });
      setItems(next);
      setLoading(false);
      return;
    }
    next.push({ label: "Loja selecionada", state: "ok" });

    const { data: cfg } = await supabase
      .from("pdv_tef_config")
      .select("provider, agent_url, environment, merchant_code, terminal_code, is_active")
      .eq("store_id", storeId)
      .maybeSingle();

    if (!cfg) {
      next.push({ label: "Config TEF cadastrada", state: "fail", detail: "Sem registro em pdv_tef_config." });
      setItems(next);
      setLoading(false);
      return;
    }
    next.push({
      label: "Config TEF cadastrada",
      state: cfg.is_active ? "ok" : "warn",
      detail: cfg.is_active ? `provider=${cfg.provider}` : "TEF inativo nesta loja",
    });

    next.push({
      label: "Ambiente em DEMO",
      state: cfg.environment === "demo" ? "ok" : "warn",
      detail: cfg.environment === "demo" ? "OK" : `Atual: ${cfg.environment}. Use DEMO.`,
    });

    const credsOk = !!cfg.merchant_code && !!cfg.terminal_code;
    next.push({
      label: "CNPJ + PdC preenchidos",
      state: credsOk ? "ok" : "warn",
      detail: credsOk ? `PdC=${cfg.terminal_code}` : "Recomendado preencher.",
    });

    const agent = await checkAcbrAgent(cfg.agent_url ?? "https://127.0.0.1:3031");
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
        ? `R$ ${Number(lastOk.amount).toFixed(2)} • NSU ${lastOk.nsu ?? "—"} • ${new Date(lastOk.finished_at as string).toLocaleString("pt-BR")}`
        : "Rode a venda de teste R$ 1,00.",
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
  const nonOk = items.filter(i => i.state !== "ok");

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Checklist de homologação</span>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Badge variant={okCount === total ? "default" : "secondary"} className="text-[10px] h-5">
              {okCount}/{total} OK
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => void run()} disabled={loading} className="h-7 w-7 p-0">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {nonOk.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Tudo certo. Use o botão <strong>Abrir menu ADM</strong> e a <strong>Venda de teste</strong> para validar o pinpad.
        </p>
      ) : (
        <ul className="space-y-1">
          {nonOk.map((it, idx) => (
            <li key={idx} className="flex items-start gap-2 rounded border bg-muted/20 px-2 py-1">
              <Dot state={it.state} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium leading-tight">{it.label}</div>
                {it.detail && (
                  <div className="text-[11px] text-muted-foreground leading-tight">{it.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
