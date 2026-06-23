import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Renderiza as bolinhas flutuantes do widget oficial iFood para a loja atual.
// Para cada (loja_atual, marca) configurada em pdv_ifood_widgets, dispara um
// iFoodWidget.init({ widgetId, merchantIds: [merchant_id] }).
// Doc: https://widgets.ifood.com.br/

declare global {
  interface Window {
    iFoodWidget?: { init: (cfg: { widgetId: string; merchantIds: string[]; container?: string }) => void };
    __ifoodWidgetInits?: Set<string>;
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

export function IFoodFloatingWidgets({ storeId }: { storeId: string | null | undefined }) {
  const validStoreId = storeId && storeId !== "ALL" ? storeId : null;

  const { data: rows } = useQuery({
    queryKey: ["ifood-floating-widgets", validStoreId],
    enabled: !!validStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_ifood_widgets" as any)
        .select("store_id, brand, widget_id, merchant_id")
        .eq("store_id", validStoreId!);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.iFoodWidget) return;
        window.__ifoodWidgetInits = window.__ifoodWidgetInits ?? new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const key = `${r.widget_id}:${r.merchant_id}`;
          if (window.__ifoodWidgetInits.has(key)) continue;
          // cria container dedicado por marca para evitar colisão de bolinhas
          const containerId = `ifood-widget-${r.brand}-${r.merchant_id.slice(0, 8)}`;
          let container = document.getElementById(containerId);
          if (!container) {
            container = document.createElement("div");
            container.id = containerId;
            container.style.position = "fixed";
            container.style.zIndex = String(9999 - i);
            container.style.right = "20px";
            // empilha verticalmente: 1ª em baixo, 2ª 80px acima, 3ª 160px acima
            container.style.bottom = `${20 + i * 80}px`;
            document.body.appendChild(container);
          }
          try {
            window.iFoodWidget.init({
              widgetId: r.widget_id,
              merchantIds: [r.merchant_id],
              container: `#${containerId}`,
            });
            window.__ifoodWidgetInits.add(key);
          } catch (e) {
            console.error("[iFoodFloatingWidgets] init error", r.brand, e);
          }
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
    // re-roda quando muda a loja (e portanto os rows)
  }, [rows]);

  return null;
}

export default IFoodFloatingWidgets;
