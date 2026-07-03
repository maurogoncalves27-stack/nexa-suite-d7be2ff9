import { useEffect, useRef, useState } from "react";
import { Tv, X, Minus, Volume2, VolumeX, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "store.tv.state";
const CHANNEL_ID = "UCd0Ya-h5tXvvwK1_Q_urMkw"; // CazéTV
const YT_LIVE_URL = "https://www.youtube.com/@CazeTV/live";
const W = 320;
const H = 180;
const HEADER_H = 32;

type State = { open: boolean; x: number; y: number; muted: boolean };

const defaultState = (): State => ({
  open: false,
  x: typeof window !== "undefined" ? window.innerWidth - W - 16 : 16,
  y: typeof window !== "undefined" ? window.innerHeight - H - HEADER_H - 16 : 16,
  muted: true,
});

const loadState = (): State => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
};

export default function FloatingTvPlayer() {
  const [state, setState] = useState<State>(() => (typeof window !== "undefined" ? loadState() : defaultState()));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  useEffect(() => {
    if (!state.open) return;
    setFailed(false);
    setLoaded(false);
    const t = setTimeout(() => setLoaded((l) => { if (!l) setFailed(true); return l; }), 6000);
    return () => clearTimeout(t);
  }, [state.open, state.muted]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - state.x, dy: e.clientY - state.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const nx = Math.max(4, Math.min(window.innerWidth - W - 4, e.clientX - dragRef.current.dx));
    const ny = Math.max(4, Math.min(window.innerHeight - H - HEADER_H - 4, e.clientY - dragRef.current.dy));
    setState((s) => ({ ...s, x: nx, y: ny }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={() => setState((s) => ({ ...s, open: true }))}
        className="fixed bottom-4 right-4 z-[60] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        title="TV ao vivo — CazéTV"
        aria-label="Abrir TV ao vivo"
      >
        <Tv className="h-5 w-5" />
      </button>
    );
  }

  const src = `https://www.youtube.com/embed/live_stream?channel=${CHANNEL_ID}&autoplay=1&mute=${state.muted ? 1 : 0}&playsinline=1`;

  const style: React.CSSProperties = isMobile
    ? { left: "5vw", right: "5vw", bottom: 16, width: "90vw" }
    : { left: state.x, top: state.y, width: W };

  return (
    <div
      className="fixed z-[60] rounded-lg border bg-card shadow-2xl overflow-hidden"
      style={style}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "flex items-center justify-between px-2 h-8 border-b bg-muted/40 select-none",
          !isMobile && "cursor-move",
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
          {!isMobile && <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <Tv className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">CazéTV • ao vivo</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, muted: !s.muted }))}
            className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
            title={state.muted ? "Ativar som" : "Silenciar"}
          >
            {state.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, open: false }))}
            className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Minimizar"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, open: false }))}
            className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"
            title="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative bg-black" style={{ aspectRatio: "16 / 9" }}>
        {!failed ? (
          <iframe
            key={state.muted ? "m" : "u"}
            src={src}
            title="CazéTV ao vivo"
            className="absolute inset-0 w-full h-full"
            frameBorder={0}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground bg-card">
            <p>Não foi possível carregar o player.</p>
            <Button asChild size="sm" variant="outline">
              <a href={YT_LIVE_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir no YouTube
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
