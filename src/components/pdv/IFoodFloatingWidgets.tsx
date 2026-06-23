import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Renderiza a bolinha flutuante do widget oficial iFood para a loja atual.
// O script do iFood aceita apenas uma instância por página, então consolidamos
// todos os merchantIds da loja em uma única chamada.
// Doc: https://widgets.ifood.com.br/

declare global {
  interface Window {
    iFoodWidget?: { init: (cfg: { widgetId: string; merchantIds: string[] }) => void };
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
        .eq("store_id", validStoreId!)
        .order("brand", { ascending: true });
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
        const widgetId = rows[0]?.widget_id;
        const merchantIds = Array.from(new Set(rows.map((r) => r.merchant_id).filter(Boolean)));
        if (!widgetId || merchantIds.length === 0) return;

        const key = `${validStoreId}:${widgetId}:${merchantIds.join("|")}`;
        if (window.__ifoodWidgetInits.has(key)) return;

        try {
          window.iFoodWidget.init({ widgetId, merchantIds });
          window.__ifoodWidgetInits.add(key);
        } catch (e) {
          console.error("[iFoodFloatingWidgets] init error", e);
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
