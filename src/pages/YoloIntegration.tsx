import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Ticket, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type YoloConfig = {
  id: string;
  base_url: string;
  enabled: boolean;
  notes: string | null;
};

type StoreRow = { id: string; name: string };
type TokenRow = { store_id: string; token: string; enabled: boolean; notes: string | null };

export default function YoloIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<YoloConfig | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [tokens, setTokens] = useState<Record<string, TokenRow>>({});

  useEffect(() => {
    (async () => {
      const [{ data: cfg }, { data: st }, { data: tk }] = await Promise.all([
        supabase.from("yolo_config").select("id, base_url, enabled, notes").limit(1).maybeSingle(),
        supabase
          .from("stores")
          .select("id, name")
          .eq("is_virtual", false)
          .eq("store_type", "loja")
          .not("name", "in", '("ESCRITÓRIO")')
          .order("name"),
        supabase.from("yolo_store_tokens").select("store_id, token, enabled, notes"),
      ]);
      setConfig((cfg as YoloConfig) ?? null);
      setStores((st as StoreRow[]) ?? []);
      const map: Record<string, TokenRow> = {};
      (tk ?? []).forEach((r: any) => (map[r.store_id] = r));
      setTokens(map);
      setLoading(false);
    })();
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from("yolo_config")
      .update({
        base_url: config.base_url.replace(/\/+$/, ""),
        enabled: config.enabled,
        notes: config.notes,
      })
      .eq("id", config.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
  };

  const saveToken = async (storeId: string) => {
    const row = tokens[storeId];
    if (!row?.token?.trim()) return toast.error("Informe o token da filial");
    const { error } = await supabase.from("yolo_store_tokens").upsert(
      {
        store_id: storeId,
        token: row.token.trim(),
        enabled: row.enabled ?? true,
        notes: row.notes ?? null,
      },
      { onConflict: "store_id" },
    );
    if (error) return toast.error(error.message);
    toast.success("Token da filial salvo");
  };

  const setToken = (storeId: string, patch: Partial<TokenRow>) =>
    setTokens((prev) => ({
      ...prev,
      [storeId]: { store_id: storeId, token: "", enabled: true, notes: null, ...prev[storeId], ...patch },
    }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Ticket className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Integração Yolo Club
        </h1>
        <p className="text-muted-foreground">
          Validação e consumo de cupons Yolo no Totem, NEXA Garçom e PDV. O token é gerado por filial no painel da
          Yolo Club.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config ? (
            <>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium text-sm">Integração ativa</p>
                  <p className="text-xs text-muted-foreground">Se desligada, as edge functions recusam as chamadas.</p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>URL base da API Yolo</Label>
                  <Input
                    value={config.base_url}
                    onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                    placeholder="https://integracao.yoloclub.com.br"
                  />
                  <p className="text-xs text-muted-foreground">
                    Produção: https://integracao.yoloclub.com.br
                  </p>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Observações internas</Label>
                  <Input
                    value={config.notes ?? ""}
                    onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                    placeholder="Ex.: contato do parceiro, datas de homologação"
                  />
                </div>
              </div>

              <Button onClick={saveConfig} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar configuração
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma configuração Yolo encontrada.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tokens por filial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stores.map((s) => {
            const row = tokens[s.id];
            return (
              <div key={s.id} className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{s.name}</p>
                  {row?.token ? (
                    <Badge variant="secondary">Configurada</Badge>
                  ) : (
                    <Badge variant="outline">Sem token</Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Token de integração (64 caracteres)</Label>
                  <Input
                    type="password"
                    value={row?.token ?? ""}
                    placeholder="Token gerado no painel da Yolo"
                    onChange={(e) => setToken(s.id, { token: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Observações</Label>
                  <Input
                    value={row?.notes ?? ""}
                    placeholder="ID interno da filial no Yolo, responsável..."
                    onChange={(e) => setToken(s.id, { notes: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={row?.enabled ?? true}
                      onCheckedChange={(v) => setToken(s.id, { enabled: v })}
                    />
                    <span className="text-xs text-muted-foreground">Ativa</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => saveToken(s.id)}>
                    Salvar
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
