import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Star, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const BRANDS: { key: string; label: string; color: string }[] = [
  { key: "aquela_parme", label: "Aquela Parmê", color: "#EB0033" },
  { key: "estrogonofe", label: "Estrogonofe", color: "#5D3A1A" },
  { key: "box_caipira", label: "Box Caipira", color: "#F58220" },
];

type Store = { id: string; name: string };
type Row = { store_id: string; brand: string; widget_id: string; merchant_id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function IFoodWidgetsSettings() {
  const qc = useQueryClient();

  const { data: stores, isLoading: loadingStores } = useQuery({
    queryKey: ["ifood-settings-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });

  const { data: rows, isLoading: loadingRows } = useQuery({
    queryKey: ["ifood-widgets-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_ifood_widgets" as any)
        .select("store_id, brand, widget_id, merchant_id");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // widgetId global por marca (compartilhado entre lojas)
  const [brandWidgetIds, setBrandWidgetIds] = useState<Record<string, string>>({});
  // merchantId por (store, brand)
  const [merchants, setMerchants] = useState<Record<string, string>>({}); // key = `${storeId}:${brand}`

  useEffect(() => {
    if (!rows) return;
    const bw: Record<string, string> = {};
    const m: Record<string, string> = {};
    for (const r of rows) {
      if (!bw[r.brand]) bw[r.brand] = r.widget_id;
      m[`${r.store_id}:${r.brand}`] = r.merchant_id;
    }
    setBrandWidgetIds((prev) => ({ ...bw, ...prev }));
    setMerchants((prev) => ({ ...m, ...prev }));
  }, [rows]);

  const physicalStores = useMemo(() => stores ?? [], [stores]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!physicalStores.length) return;
    // Validar widget_ids (precisa pelo menos das marcas que terão merchants)
    const upserts: Row[] = [];
    const deletes: { store_id: string; brand: string }[] = [];

    for (const store of physicalStores) {
      for (const b of BRANDS) {
        const key = `${store.id}:${b.key}`;
        const merchant = (merchants[key] || "").trim();
        const widgetId = (brandWidgetIds[b.key] || "").trim();

        if (!merchant) {
          deletes.push({ store_id: store.id, brand: b.key });
          continue;
        }
        if (!UUID_RE.test(merchant)) {
          toast.error(`Merchant UUID inválido em ${store.name} / ${b.label}`);
          return;
        }
        if (!UUID_RE.test(widgetId)) {
          toast.error(`Widget UUID inválido para ${b.label} (preencha no topo)`);
          return;
        }
        upserts.push({ store_id: store.id, brand: b.key, widget_id: widgetId, merchant_id: merchant });
      }
    }

    setSaving(true);
    try {
      if (upserts.length) {
        const { error } = await supabase
          .from("pdv_ifood_widgets" as any)
          .upsert(upserts as any, { onConflict: "store_id,brand" });
        if (error) throw error;
      }
      for (const d of deletes) {
        await supabase
          .from("pdv_ifood_widgets" as any)
          .delete()
          .eq("store_id", d.store_id)
          .eq("brand", d.brand);
      }
      await qc.invalidateQueries({ queryKey: ["ifood-widgets-all"] });
      await qc.invalidateQueries({ queryKey: ["ifood-floating-widgets"] });
      toast.success("Configuração salva.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const loading = loadingStores || loadingRows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Widgets iFood (PDV)
        </h1>
        <p className="text-muted-foreground">
          Configure os 3 widgets oficiais do iFood (Parmê, Estrogonofe, Box Caipira) e o merchantId de cada loja física.
          As bolinhas aparecem só dentro do PDV da loja selecionada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Widget ID por marca</CardTitle>
          <CardDescription>
            UUID do widget criado em <span className="font-medium">developer.ifood.com.br → Widgets</span>. Um widget por marca,
            compartilhado entre todas as lojas daquela marca.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {BRANDS.map((b) => (
            <div key={b.key} className="space-y-1">
              <Label className="text-xs flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: b.color }} />
                {b.label} — Widget ID
              </Label>
              <Input
                value={brandWidgetIds[b.key] ?? ""}
                onChange={(e) => setBrandWidgetIds((p) => ({ ...p, [b.key]: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono text-xs"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merchant UUID por loja × marca</CardTitle>
          <CardDescription>
            Cole o UUID do merchant (Portal do Parceiro → Configurações da Loja → ID da loja).
            Deixe vazio se a marca não opera naquela loja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Loja</th>
                    {BRANDS.map((b) => (
                      <th key={b.key} className="text-left py-2 px-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: b.color }} />
                          {b.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {physicalStores.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium">{s.name}</td>
                      {BRANDS.map((b) => {
                        const key = `${s.id}:${b.key}`;
                        return (
                          <td key={b.key} className="py-2 px-2">
                            <Input
                              value={merchants[key] ?? ""}
                              onChange={(e) => setMerchants((p) => ({ ...p, [key]: e.target.value }))}
                              placeholder="UUID do merchant"
                              className="font-mono text-xs min-w-[260px]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar configuração
        </Button>
      </div>
    </div>
  );
}
