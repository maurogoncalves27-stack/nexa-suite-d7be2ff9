import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Settings2 } from "lucide-react";
import { toast } from "sonner";

// Widget oficial do iFood: https://widgets.ifood.com.br/
// Aceita até 10 merchantIds (UUIDs, não os ids numéricos).
// Como temos várias marcas por loja, mantemos um widget por marca.
const WIDGET_ID = "51f75fec-0ac2-41c1-84c6-af0df25bfe04";

type BrandKey = "aquela_parme" | "estrogonofe" | "box_caipira";
const BRANDS: { key: BrandKey; label: string }[] = [
  { key: "aquela_parme", label: "Aquela Parmê" },
  { key: "estrogonofe", label: "Estrogonofe" },
  { key: "box_caipira", label: "Box Caipira" },
];
const storageKeyFor = (b: BrandKey) => `ifood_widget_merchant_uuids:${b}`;

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

function BrandWidget({ brand, active }: { brand: { key: BrandKey; label: string }; active: boolean }) {
  const [merchantIds, setMerchantIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKeyFor(brand.key));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = useState(merchantIds.length === 0);
  const [draft, setDraft] = useState(merchantIds.join("\n"));

  useEffect(() => {
    if (!active || merchantIds.length === 0) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.iFoodWidget) return;
        try {
          window.iFoodWidget.init({ widgetId: WIDGET_ID, merchantIds });
        } catch (e) {
          console.error("[iFoodWidget] init error", e);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [active, merchantIds]);

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
      toast.error("O widget aceita no máximo 10 lojas por marca.");
      return;
    }
    localStorage.setItem(storageKeyFor(brand.key), JSON.stringify(parsed));
    setMerchantIds(parsed);
    setEditing(false);
    toast.success(`${brand.label}: widget atualizado.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {merchantIds.length > 0
            ? `${merchantIds.length} loja(s) configurada(s) em ${brand.label}.`
            : `Nenhuma loja configurada para ${brand.label}.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          <Settings2 className="h-4 w-4 mr-1" />
          {editing ? "Fechar" : "Configurar lojas"}
        </Button>
      </div>

      {editing && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label className="text-sm">Merchant UUIDs do iFood — {brand.label} (um por linha, até 10)</Label>
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
          Configure as lojas desta marca para carregar o widget.
        </div>
      ) : (
        <div id="ifood-widget-container" className="min-h-[400px]">
          {/* O script do iFood injeta o conteúdo aqui (re-inicializa ao trocar de aba) */}
        </div>
      )}
    </div>
  );
}

export function IFoodReviewsWidget() {
  const [tab, setTab] = useState<BrandKey>("aquela_parme");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-5 w-5 text-primary" />
          Avaliações do iFood (widget oficial)
        </CardTitle>
        <CardDescription>
          Um widget por marca. A autorização (primeiro acesso) precisa ser feita por quem tem login no Portal do Parceiro daquela marca.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as BrandKey)}>
          <TabsList className="grid grid-cols-3 w-full md:w-auto">
            {BRANDS.map((b) => (
              <TabsTrigger key={b.key} value={b.key}>{b.label}</TabsTrigger>
            ))}
          </TabsList>
          {BRANDS.map((b) => (
            <TabsContent key={b.key} value={b.key} className="mt-4">
              <BrandWidget brand={b} active={tab === b.key} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default IFoodReviewsWidget;
