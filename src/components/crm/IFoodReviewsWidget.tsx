import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Loader2 } from "lucide-react";

// Widget oficial do iFood — visualização no CRM.
// Lê os UUIDs salvos em pdv_ifood_widgets (configurados em /configuracoes/ifood-widgets)
// e renderiza um card por loja física com 1 widget por marca.

const BRAND_META: Record<string, { label: string; color: string }> = {
  aquela_parme: { label: "Aquela Parmê", color: "#EB0033" },
  estrogonofe: { label: "Estrogonofe", color: "#5D3A1A" },
  box_caipira: { label: "Box Caipira", color: "#F58220" },
};

declare global {
  interface Window {
    iFoodWidget?: { init: (cfg: { widgetId: string; merchantIds: string[]; container?: string }) => void };
    __ifoodCrmInits?: Set<string>;
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.iFoodWidget) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://widgets.ifood.com.br/widget.js"]'
    );
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

type Row = { store_id: string; brand: string; widget_id: string; merchant_id: string };
type Store = { id: string; name: string };

function StoreCard({ store, rows }: { store: Store; rows: Row[] }) {
  const initedRef = useRef(false);

  useEffect(() => {
    if (rows.length === 0 || initedRef.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.iFoodWidget) return;
        window.__ifoodCrmInits = window.__ifoodCrmInits ?? new Set<string>();
        for (const r of rows) {
          const key = `${r.widget_id}:${r.merchant_id}`;
          if (window.__ifoodCrmInits.has(key)) continue;
          try {
            window.iFoodWidget.init({ widgetId: r.widget_id, merchantIds: [r.merchant_id] });
            window.__ifoodCrmInits.add(key);
          } catch (e) {
            console.error("[IFoodReviewsWidget]", r.brand, e);
          }
        }
        initedRef.current = true;
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return (
    <Card className="min-w-[340px] w-[360px] flex-shrink-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4 text-primary" />
          {store.name}
        </CardTitle>
        <CardDescription className="text-xs">
          {rows.length} marca(s) configurada(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Nenhuma marca configurada. Vá em <span className="font-medium">Configurações → Widgets iFood</span>.
          </p>
        ) : (
          rows.map((r) => {
            const meta = BRAND_META[r.brand] ?? { label: r.brand, color: "#666" };
            return (
              <div key={r.brand} className="rounded-md border bg-muted/30 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: meta.color }}
                  />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">merchant</Badge>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground break-all select-all" title="Merchant UUID">
                  {r.merchant_id}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground break-all select-all" title="Widget UUID">
                  widget: {r.widget_id}
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function IFoodReviewsWidget() {
  const { data: stores, isLoading: loadingStores } = useQuery({
    queryKey: ["ifood-crm-stores"],
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
    queryKey: ["ifood-crm-widgets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_ifood_widgets" as any)
        .select("store_id, brand, widget_id, merchant_id");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rowsByStore = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const r of rows ?? []) {
      (map[r.store_id] ||= []).push(r);
    }
    // ordem fixa: Parmê, Estrogonofe, Box Caipira
    const order = ["aquela_parme", "estrogonofe", "box_caipira"];
    for (const sid of Object.keys(map)) {
      map[sid].sort((a, b) => order.indexOf(a.brand) - order.indexOf(b.brand));
    }
    return map;
  }, [rows]);

  const loading = loadingStores || loadingRows;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-5 w-5 text-primary" />
          Avaliações do iFood (widget oficial)
        </CardTitle>
        <CardDescription>
          Um card por loja com os UUIDs das 3 marcas (Aquela Parmê, Estrogonofe, Box Caipira) já configurados.
          As bolinhas flutuantes aparecem dentro do PDV daquela loja. Para editar os IDs, vá em
          <span className="font-medium"> Configurações → Widgets iFood</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : !stores || stores.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Você não tem acesso a nenhuma loja.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3">
            {stores
              .filter((s) => (rowsByStore[s.id]?.length ?? 0) > 0)
              .map((s) => (
                <StoreCard key={s.id} store={s} rows={rowsByStore[s.id] ?? []} />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default IFoodReviewsWidget;
