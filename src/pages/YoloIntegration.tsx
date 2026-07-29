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
  environment: string;
  base_url: string;
  partner_id: string | null;
  validate_path: string;
  confirm_path: string;
  code_header_name: string;
  enabled: boolean;
  notes: string | null;
};

type StoreRow = { id: string; name: string };
type TokenRow = { store_id: string; token: string; yolo_branch_id: string | null; enabled: boolean };

export default function YoloIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<YoloConfig | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [tokens, setTokens] = useState<Record<string, TokenRow>>({});

  useEffect(() => {
    (async () => {
      const [{ data: cfg }, { data: st }, { data: tk }] = await Promise.all([
        supabase.from("yolo_config").select("*").limit(1).maybeSingle(),
        supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
        supabase.from("yolo_store_tokens").select("store_id, token, yolo_branch_id, enabled"),
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
        base_url: config.base_url,
        environment: config.environment,
        partner_id: config.partner_id,
        validate_path: config.validate_path,
        confirm_path: config.confirm_path,
        code_header_name: config.code_header_name,
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
        yolo_branch_id: row.yolo_branch_id?.trim() || null,
        enabled: row.enabled ?? true,
      },
      { onConflict: "store_id" },
    );
    if (error) return toast.error(error.message);
    toast.success("Token da filial salvo");
  };

  const setToken = (storeId: string, patch: Partial<TokenRow>) =>
    setTokens((prev) => ({
      ...prev,
      [storeId]: { store_id: storeId, token: "", yolo_branch_id: null, enabled: true, ...prev[storeId], ...patch },
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
          Validação e confirmação de cupons Yolo no Totem e no NEXA Garçom. O token é gerado por filial no painel da
          Yolo e enviado no cabeçalho junto com o código do cliente.
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
                <div className="space-y-1.5">
                  <Label>URL base</Label>
                  <Input
                    value={config.base_url}
                    onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ambiente</Label>
                  <Input
                    value={config.environment}
                    onChange={(e) => setConfig({ ...config, environment: e.target.value })}
                    placeholder="sandbox ou production"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Caminho de validação</Label>
                  <Input
                    value={config.validate_path}
                    onChange={(e) => setConfig({ ...config, validate_path: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Caminho de confirmação</Label>
                  <Input
                    value={config.confirm_path}
                    onChange={(e) => setConfig({ ...config, confirm_path: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Header do código do cliente</Label>
                  <Input
                    value={config.code_header_name}
                    onChange={(e) => setConfig({ ...config, code_header_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Partner ID (opcional)</Label>
                  <Input
                    value={config.partner_id ?? ""}
                    onChange={(e) => setConfig({ ...config, partner_id: e.target.value })}
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
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs">Token de integração</Label>
                    <Input
                      type="password"
                      value={row?.token ?? ""}
                      placeholder="Token gerado no painel da Yolo"
                      onChange={(e) => setToken(s.id, { token: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ID da filial na Yolo</Label>
                    <Input
                      value={row?.yolo_branch_id ?? ""}
                      onChange={(e) => setToken(s.id, { yolo_branch_id: e.target.value })}
                    />
                  </div>
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
