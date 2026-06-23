import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Widget oficial do iFood: https://widgets.ifood.com.br/
// Renderizamos UM card por loja física (Asa Norte, Asa Sul, Águas Claras, Lago Sul).
// Cada card aceita até 10 UUIDs (uma marca da loja por UUID; geralmente até 3: Parmê / Estrogonofe / Box Caipira).
const WIDGET_ID = "51f75fec-0ac2-41c1-84c6-af0df25bfe04";
const storageKeyFor = (storeId: string) => `ifood_widget_merchant_uuids:store:${storeId}`;

declare global {
  interface Window {
    iFoodWidget?: { init: (cfg: { widgetId: string; merchantIds: string[]; container?: string }) => void };
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.iFoodWidget) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://widgets.ifood.com.br/widget.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar widget iFood")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://widgets.ifood.com.br/widget.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar widget iFood"));
    document.head.appendChild(s);
  });
}

type StoreRow = { id: string; name: string };

function StoreWidgetCard({ store }: { store: StoreRow }) {
  const storageKey = storageKeyFor(store.id);
  const [merchantIds, setMerchantIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState(merchantIds.length === 0);
  const [draft, setDraft] = useState(merchantIds.join("\n"));
  const containerId = useMemo(() => `ifood-widget-${store.id}`, [store.id]);
  const initRef = useRef(false);

  useEffect(() => {
    if (merchantIds.length === 0) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.iFoodWidget) return;
        try {
          window.iFoodWidget.init({ widgetId: WIDGET_ID, merchantIds, container: `#${containerId}` });
          initRef.current = true;
        } catch (e) {
          console.error(`[iFoodWidget ${store.name}] init error`, e);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [merchantIds, containerId, store.name]);

  function save() {
    const parsed = draft
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length === 0) {
      toast.error("Cole pelo menos um merchantId (UUID) do iFood.");
      return;
    }
    if (parsed.length > 10) {
      toast.error("O widget aceita no máximo 10 lojas/UUIDs por card.");
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(parsed));
    setMerchantIds(parsed);
    setEditing(false);
    toast.success(`${store.name}: widget atualizado.`);
  }

  return (
    <Card className="min-w-[360px] w-[380px] flex-shrink-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 text-primary" />
            {store.name}
          </CardTitle>
          <CardDescription className="text-xs">
            {merchantIds.length > 0
              ? `${merchantIds.length} marca(s) configurada(s)`
              : "Nenhuma marca configurada"}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-xs">UUIDs do iFood — {store.name} (1 por linha; uma por marca)</Label>
            <Textarea
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"ex.: 51f75fec-0ac2-41c1-84c6-af0df25bfe04"}
              className="font-mono text-[11px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Portal do Parceiro iFood → Configurações da Loja → ID da loja (UUID). Não use o número curto.
            </p>
            <Button size="sm" onClick={save}>Salvar</Button>
          </div>
        )}

        {merchantIds.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Configure os UUIDs desta loja.
          </div>
        ) : (
          <div id={containerId} className="min-h-[400px]" />
        )}
      </CardContent>
    </Card>
  );
}

export function IFoodReviewsWidget() {
  const { data: stores, isLoading } = useQuery({
    queryKey: ["ifood-widget-stores"],
    queryFn: async () => {
      // RLS já filtra as lojas que o usuário tem acesso.
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-5 w-5 text-primary" />
          Avaliações do iFood (widget oficial)
        </CardTitle>
        <CardDescription>
          Um card por loja. Em cada card cole os UUIDs do iFood das marcas daquela loja (até 3: Aquela Parmê, Estrogonofe, Box Caipira).
          A autorização inicial precisa ser feita por quem tem login no Portal do Parceiro daquela loja.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando lojas...
          </div>
        ) : !stores || stores.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Você não tem acesso a nenhuma loja.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3">
            {stores.map((s) => (
              <StoreWidgetCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default IFoodReviewsWidget;
