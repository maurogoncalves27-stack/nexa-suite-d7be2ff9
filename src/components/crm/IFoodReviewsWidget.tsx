import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Settings2 } from "lucide-react";
import { toast } from "sonner";

// Widget público do iFood para exibir/responder avaliações de loja.
// Doc: https://widgets.ifood.com.br/
// Aceita até 10 merchantIds (UUIDs do iFood, NÃO os ids numéricos).
const WIDGET_ID = "51f75fec-0ac2-41c1-84c6-af0df25bfe04";
const STORAGE_KEY = "ifood_widget_merchant_uuids";

declare global {
  interface Window {
    iFoodWidget?: { init: (cfg: { widgetId: string; merchantIds: string[] }) => void };
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

export function IFoodReviewsWidget() {
  const [merchantIds, setMerchantIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState(merchantIds.length === 0);
  const [draft, setDraft] = useState(merchantIds.join("\n"));
  const mountedRef = useRef(false);

  useEffect(() => {
    if (merchantIds.length === 0) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.iFoodWidget) return;
        try {
          window.iFoodWidget.init({ widgetId: WIDGET_ID, merchantIds });
          mountedRef.current = true;
        } catch (e) {
          console.error("[iFoodWidget] init error", e);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [merchantIds]);

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
      toast.error("O widget aceita no máximo 10 lojas.");
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    setMerchantIds(parsed);
    setEditing(false);
    toast.success("Widget atualizado. Recarregue a página se ele não aparecer.");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-5 w-5 text-primary" />
            Avaliações do iFood (widget oficial)
          </CardTitle>
          <CardDescription>
            Exibe e permite responder avaliações direto do portal do iFood, sem sair do NEXA.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          <Settings2 className="h-4 w-4 mr-1" />
          {editing ? "Fechar" : "Configurar lojas"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-sm">Merchant UUIDs do iFood (um por linha, até 10)</Label>
            <Textarea
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"ex.: 51f75fec-0ac2-41c1-84c6-af0df25bfe04\n..."}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Pegue o UUID em <span className="font-medium">Portal do Parceiro iFood → Configurações da Loja → ID da loja (UUID)</span>.
              Não use o número curto — o widget só aceita UUID.
            </p>
            <Button size="sm" onClick={save}>Salvar e carregar</Button>
          </div>
        )}

        {merchantIds.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Configure as lojas para carregar o widget.
          </div>
        ) : (
          <div id="ifood-widget-container" className="min-h-[400px]">
            {/* O script do iFood injeta o conteúdo aqui */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default IFoodReviewsWidget;
