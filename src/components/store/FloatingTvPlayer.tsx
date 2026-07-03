import { useEffect, useMemo, useRef, useState } from "react";
import { Tv, X, Minus, Volume2, VolumeX, GripHorizontal, Settings2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "store.tv.state";
const CHANNEL_ID = "UCZiYbVptd3PVPf4f6eR6UaQ"; // CazéTV (@CazeTV)

const W = 320;
const H = 180;
const HEADER_H = 32;

type State = { open: boolean; x: number; y: number; muted: boolean; videoId: string };
type LiveInfo = {
  live: boolean;
  videoId: string | null;
  title: string | null;
  embeddable?: boolean | null;
  blocked?: boolean;
};

const defaultState = (): State => ({
  open: false,
  x: typeof window !== "undefined" ? window.innerWidth - W - 16 : 16,
  y: typeof window !== "undefined" ? window.innerHeight - H - HEADER_H - 16 : 16,
  muted: true,
  videoId: "",
});

function parseVideoId(input: string): string {
  const s = input.trim();
  if (!s) return "";
  const m = s.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
}

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
  const [state, setState] = useState<State>(() =>
    typeof window !== "undefined" ? loadState() : defaultState(),
  );
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [liveInfo, setLiveInfo] = useState<LiveInfo>({
    live: false,
    videoId: null,
    title: null,
  });
  const [blockedVideoId, setBlockedVideoId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Detecta live automaticamente via edge function
  const checkLive = async () => {
    setChecking(true);
    try {
      const { data } = await supabase.functions.invoke("youtube-live", {
        body: { channelId: CHANNEL_ID },
      });
      if (data) {
        setLiveInfo({
          live: !!data.live,
          videoId: data.videoId ?? null,
          title: data.title ?? null,
          embeddable: data.embeddable ?? null,
          blocked: !!data.blocked,
        });
        if (data.videoId && data.blocked) setBlockedVideoId(data.videoId);
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!state.open) return;
    checkLive();
    const interval = setInterval(checkLive, 5 * 60 * 1000); // revalida a cada 5min
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    setFailed(false);
    setLoaded(false);
    const t = setTimeout(() => setLoaded((l) => { if (!l) setFailed(true); return l; }), 8000);
    return () => clearTimeout(t);
  }, [state.open, state.muted, state.videoId, liveInfo.videoId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Prioridade: vídeo manual > live detectada via API > fallback embed do canal
  const activeVideoId = state.videoId || liveInfo.videoId || "";
  const src = useMemo(() => {
    const common = `autoplay=1&mute=${state.muted ? 1 : 0}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&fs=0&origin=${encodeURIComponent(origin)}`;
    if (activeVideoId) return `https://www.youtube-nocookie.com/embed/${activeVideoId}?${common}`;
    return `https://www.youtube.com/embed/live_stream?channel=${CHANNEL_ID}&${common}`;
  }, [activeVideoId, state.muted, origin]);

  const validateManualVideo = async (videoId: string) => {
    if (!videoId) return;
    setChecking(true);
    setBlockedVideoId(null);
    try {
      const { data } = await supabase.functions.invoke("youtube-live", {
        body: { videoId },
      });
      if (data?.blocked) setBlockedVideoId(videoId);
    } catch {
      // se não validar, tenta carregar normalmente
    } finally {
      setChecking(false);
    }
  };

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

  const style: React.CSSProperties = isMobile
    ? { left: "5vw", right: "5vw", bottom: 16, width: "90vw" }
    : { left: state.x, top: state.y, width: W };

  const hasStream = !!activeVideoId;
  const isEmbedBlocked = !!activeVideoId && blockedVideoId === activeVideoId;
  const statusLabel = state.videoId
    ? isEmbedBlocked ? "bloqueado no site" : "vídeo fixo"
    : liveInfo.live
      ? liveInfo.blocked ? "ao vivo bloqueado" : "ao vivo"
      : checking
        ? "verificando…"
        : "sem transmissão";

  return (
    <div className="fixed z-[60] rounded-lg border bg-card shadow-2xl overflow-hidden" style={style}>
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
          <span className="truncate">CazéTV • {statusLabel}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={checkLive}
            disabled={checking}
            className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Verificar live agora"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => { setUrlInput(state.videoId); setShowSettings((v) => !v); }}
            className={cn(
              "h-6 w-6 rounded hover:bg-muted flex items-center justify-center",
              showSettings ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            title="Trocar vídeo/canal"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
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

      {showSettings && (
        <div className="p-2 border-b bg-muted/20 space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Cole o link do YouTube (vídeo ou live)
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="youtube.com/watch?v=... ou ID"
              className="flex-1 h-7 px-2 text-xs rounded border bg-background"
            />
            <button
              type="button"
              onClick={() => {
                const id = parseVideoId(urlInput);
                setState((s) => ({ ...s, videoId: id }));
                validateManualVideo(id);
                setShowSettings(false);
              }}
              className="h-7 px-2 text-xs rounded bg-primary text-primary-foreground hover:opacity-90"
            >
              OK
            </button>
          </div>
          {state.videoId && (
            <button
              type="button"
              onClick={() => { setState((s) => ({ ...s, videoId: "" })); setUrlInput(""); }}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Voltar para live automática da CazéTV
            </button>
          )}
        </div>
      )}

      <div className="relative bg-black" style={{ aspectRatio: "16 / 9" }}>
        {hasStream && !failed && !isEmbedBlocked ? (
          <iframe
            key={`${activeVideoId}-${state.muted ? "m" : "u"}`}
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
            {!hasStream ? (
              <>
                <Tv className="h-6 w-6 text-muted-foreground" />
                <p>Sem transmissão ao vivo no momento.</p>
                <button
                  type="button"
                  onClick={checkLive}
                  className="text-primary hover:underline"
                >
                  Verificar novamente
                </button>
              </>
            ) : (
              <>
                <p>Este vídeo está bloqueado para tocar dentro do sistema.</p>
                <button
                  type="button"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${activeVideoId}`, "cazetv", "width=420,height=260,popup=yes")}
                  className="text-primary hover:underline"
                >
                  Abrir em janela pequena
                </button>
                <button
                  type="button"
                  onClick={() => { setUrlInput(state.videoId); setShowSettings(true); setFailed(false); setBlockedVideoId(null); }}
                  className="text-primary hover:underline"
                >
                  Colar outro link do YouTube
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
