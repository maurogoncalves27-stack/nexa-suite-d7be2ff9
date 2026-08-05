// Pré-visualização em tempo real da tela do totem com base nas configurações
// das abas Visual e Vídeo. Componente puramente de apresentação.
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Hand, Timer, Monitor, Info, Maximize2 } from "lucide-react";

export interface PreviewAsset {
  id: string;
  kind: "background" | "logo" | "video";
  brand_slug: string | null;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}
export interface PreviewBrand {
  id: string;
  name: string;
  slug: string;
}

const SCREEN_W = 1080;
const SCREEN_H = 1920;

// Mesmo tema aplicado no totem real (/totem) — primário vermelho da marca.
const TOTEM_THEME_STYLE = {
  "--primary": "0 82% 43%",
  "--primary-foreground": "0 0% 100%",
  "--primary-glow": "0 88% 56%",
  "--accent": "6 84% 54%",
  "--accent-foreground": "0 0% 100%",
  "--ring": "0 82% 43%",
} as CSSProperties;

export default function TotemLivePreview({
  assets,
  brands,
}: {
  assets: PreviewAsset[];
  brands: PreviewBrand[];
}) {
  const [mode, setMode] = useState<"idle" | "brands">("idle");
  const [slide, setSlide] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [fullScale, setFullScale] = useState(0.4);


  const video = useMemo(
    () => assets.find((a) => a.kind === "video" && a.is_active) ?? null,
    [assets],
  );
  const backgrounds = useMemo(
    () =>
      assets
        .filter((a) => a.kind === "background" && a.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [assets],
  );
  const logoBySlug = useMemo(() => {
    const map = new Map<string, string>();
    assets
      .filter((a) => a.kind === "logo" && a.is_active && a.brand_slug)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((a) => {
        if (!map.has(a.brand_slug!)) map.set(a.brand_slug!, a.image_url);
      });
    return map;
  }, [assets]);

  // escala o "monitor" 1080x1920 para a largura disponível
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / SCREEN_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // slideshow (mesma cadência da tela de atrair)
  useEffect(() => {
    if (video || backgrounds.length <= 1) return;
    const t = setInterval(() => setSlide((s) => s + 1), 5000);
    return () => clearInterval(t);
  }, [video, backgrounds.length]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Pré-visualização do totem
          </h2>
          <p className="text-sm text-muted-foreground">
            Atualiza automaticamente conforme você altera fundos, vídeo e logos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "idle" ? "default" : "outline"}
            onClick={() => setMode("idle")}
          >
            Tela de atrair
          </Button>
          <Button
            size="sm"
            variant={mode === "brands" ? "default" : "outline"}
            onClick={() => setMode("brands")}
          >
            Escolha de marca
          </Button>
        </div>
      </div>

      {mode === "idle" && video && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Há um vídeo ativo — o slideshow de imagens não será exibido no totem.</span>
        </div>
      )}
      {mode === "idle" && !video && backgrounds.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Nenhum fundo ativo — o totem usará as imagens padrão de fábrica.</span>
        </div>
      )}
      {mode === "brands" && brands.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Nenhuma marca ativa cadastrada.</span>
        </div>
      )}

      <button
        type="button"
        ref={wrapRef as never}
        onClick={() => setExpanded(true)}
        aria-label="Ampliar pré-visualização do totem"
        className="group relative block w-full overflow-hidden rounded-lg border border-border bg-background cursor-zoom-in transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: SCREEN_H * scale }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none"
          style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})` }}
        >
          {screen}
        </div>
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" /> Ampliar
        </span>
      </button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[95vw] w-auto p-3">
          <div
            ref={fullRef}
            className="relative overflow-hidden rounded-lg border border-border bg-background"
            style={{ width: SCREEN_W * fullScale, height: SCREEN_H * fullScale }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${fullScale})` }}
            >
              {screen}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="font-normal">
          {video ? "Vídeo ativo" : `${backgrounds.length} fundo(s) ativo(s)`}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {logoBySlug.size}/{brands.length} logo(s) cadastrada(s)
        </Badge>
      </div>
    </Card>
  );
}

