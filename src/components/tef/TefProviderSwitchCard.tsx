/**
 * Card de chaveamento TEF: escolhe o provider ativo da loja (PayGo / Payer / Mock).
 * A fonte da verdade é pdv_tef_config.provider; o agente local recebe a ordem
 * de encerrar a sessão anterior antes de assumir o pinpad.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, ArrowLeftRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  fetchTefAgentHealth,
  setActiveTefProvider,
  type TefAgentHealth,
  type TefProvider,
} from "@/lib/tef/providerSwitch";

interface Props {
  agentUrl: string;
  storeId?: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  paygo: "PayGo Integrado",
  payer: "Payer (Checkout Localhost)",
  mock: "Mock (sem pinpad)",
};

export default function TefProviderSwitchCard({ agentUrl, storeId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<TefAgentHealth | null>(null);
  const [dbProvider, setDbProvider] = useState<TefProvider>("mock");
  const [selected, setSelected] = useState<TefProvider>("mock");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchTefAgentHealth(agentUrl);
      setHealth(h);
      if (storeId) {
        const { data } = await supabase
          .from("pdv_tef_config")
          .select("provider")
          .eq("store_id", storeId)
          .maybeSingle();
        const p = (data?.provider as TefProvider) ?? "mock";
        setDbProvider(p);
        setSelected(p);
      }
    } finally {
      setLoading(false);
    }
  }, [agentUrl, storeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const apply = async () => {
    if (!storeId) {
      toast({ title: "Selecione a loja", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // 1) agente encerra a sessão do provider anterior e assume o novo
      const res = await setActiveTefProvider(agentUrl, selected);
      if (!res.ok) {
        toast({
          title: res.busy ? "Pinpad ocupado" : "Falha ao chavear",
          description: res.error || "O agente local recusou a troca.",
          variant: "destructive",
        });
        return;
      }

      // 2) só então grava o provider da loja
      const { error } = await supabase
        .from("pdv_tef_config")
        .upsert(
          { store_id: storeId, provider: selected, agent_url: agentUrl, is_active: true },
          { onConflict: "store_id" },
        );
      if (error) throw error;

      setDbProvider(selected);
      toast({
        title: "Provider chaveado",
        description: `${PROVIDER_LABEL[selected]} ativo. Faça uma venda de teste de R$ 0,01 e cancele para baixar as tabelas.`,
      });
      await refresh();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const active = health?.activeProvider ?? null;
  const paygo = health?.providers?.paygo;
  const payer = health?.providers?.payer;
  const divergent = !!active && active !== dbProvider;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          Chaveamento de TEF
        </h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        PayGo e Payer podem ficar instalados juntos, mas o pinpad é exclusivo: só um mantém a sessão aberta por vez.
        O número lógico (PdC do PayGo / terminal do Payer) fica gravado na instalação da máquina, não no pinpad.
      </p>

      <div className="flex flex-wrap gap-2">
        <Badge variant={health?.ok ? "default" : "destructive"}>
          Agente {health?.ok ? "online" : "offline"}
        </Badge>
        <Badge variant={active ? "default" : "outline"}>
          Ativo no agente: {active ? PROVIDER_LABEL[active] : "nenhum"}
        </Badge>
        <Badge variant="secondary">Loja (banco): {PROVIDER_LABEL[dbProvider]}</Badge>
      </div>

      <div className="grid gap-2 text-xs">
        <div className="flex items-center gap-2">
          {paygo?.installed ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          )}
          <span className="text-muted-foreground">
            PayGo: {paygo?.installed ? `DLL em ${paygo.dllPath}` : "PGWebLib.dll não encontrada nesta máquina"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {payer?.installed ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          )}
          <span className="text-muted-foreground">
            Payer: {payer?.baseUrl || "Checkout local não informado"}
          </span>
        </div>
      </div>

      {divergent && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
          Divergência: o agente está com <strong>{PROVIDER_LABEL[active!]}</strong>, mas a loja está
          configurada como <strong>{PROVIDER_LABEL[dbProvider]}</strong>. Aplique o chaveamento para alinhar.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px]">
          <label className="text-xs text-muted-foreground">Provider da loja</label>
          <Select value={selected} onValueChange={(v) => setSelected(v as TefProvider)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paygo">{PROVIDER_LABEL.paygo}</SelectItem>
              <SelectItem value="payer">{PROVIDER_LABEL.payer}</SelectItem>
              <SelectItem value="mock">{PROVIDER_LABEL.mock}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={apply} disabled={saving || !storeId}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Aplicar chaveamento
        </Button>
      </div>
    </Card>
  );
}
