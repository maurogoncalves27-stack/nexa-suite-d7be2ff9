import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface MaintenancePhotoCaptureButtonProps {
  disabled?: boolean;
  onCapture: (file: File) => void;
}

export function MaintenancePhotoCaptureButton({
  disabled = false,
  onCapture,
}: MaintenancePhotoCaptureButtonProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const readyCheckTimeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopEvent = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const clearReadyCheck = useCallback(() => {
    if (readyCheckTimeoutRef.current !== null) {
      window.clearTimeout(readyCheckTimeoutRef.current);
      readyCheckTimeoutRef.current = null;
    }
  }, []);

  const markVideoReady = useCallback(() => {
    const video = videoRef.current;
    if (!video) return false;

    const hasFrame = video.videoWidth > 0 && video.videoHeight > 0;
    const hasBufferedData = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    const ready = hasFrame || hasBufferedData;

    if (ready) {
      clearReadyCheck();
      setVideoReady(true);
    }

    return ready;
  }, [clearReadyCheck]);

  const scheduleReadyCheck = useCallback((attempt = 0) => {
    clearReadyCheck();
    readyCheckTimeoutRef.current = window.setTimeout(() => {
      if (!streamRef.current) return;
      if (markVideoReady()) return;
      if (attempt < 40) {
        scheduleReadyCheck(attempt + 1);
      }
    }, attempt === 0 ? 0 : 100);
  }, [clearReadyCheck, markVideoReady]);

  const stopCamera = useCallback(() => {
    clearReadyCheck();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch { /* noop */ }
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
  }, [clearReadyCheck]);

  useEffect(() => stopCamera, [stopCamera]);

  const attachStream = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    setVideoReady(false);
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try { await video.play(); } catch { /* noop */ }
    if (!markVideoReady()) {
      scheduleReadyCheck();
    }
  }, [markVideoReady, scheduleReadyCheck]);

  const startCameraStream = useCallback(async () => {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("A câmera do navegador não está disponível neste aparelho.");
      startingRef.current = false;
      setOpen(false);
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }
      streamRef.current = stream;
      await attachStream(stream);
    } catch (error: any) {
      console.error("Falha ao abrir câmera:", error);
      const msg =
        error?.name === "NotAllowedError" ? "Permita o acesso à câmera nas configurações do navegador."
        : error?.name === "NotFoundError" ? "Nenhuma câmera encontrada neste aparelho."
        : error?.name === "NotReadableError" ? "A câmera está sendo usada por outro app."
        : (error?.message ?? "Não foi possível abrir a câmera.");
      toast.error(msg);
      stopCamera();
      setOpen(false);
    } finally {
      startingRef.current = false;
    }
  }, [attachStream, stopCamera]);

  const handleVideoMount = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (!node) return;
      if (streamRef.current) {
        void attachStream(streamRef.current);
      }
    },
    [attachStream],
  );

  const closeAll = useCallback(() => {
    stopCamera();
    setOpen(false);
  }, [stopCamera]);

  const capturePhoto = async (e: React.MouseEvent) => {
    stopEvent(e);
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("A câmera ainda está iniciando. Tente novamente.");
      return;
    }
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { toast.error("Não foi possível preparar a foto."); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
      );
      canvas.width = 0; canvas.height = 0;
      if (!blob) { toast.error("Não foi possível capturar a foto."); return; }
      const file = new File([blob], `foto-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      onCapture(file);
      requestAnimationFrame(() => closeAll());
    } catch (error: any) {
      console.error("Falha ao capturar foto:", error);
      toast.error(error?.message ?? "Não foi possível capturar a foto.");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          stopEvent(e);
          setOpen(true);
          void startCameraStream();
        }}
        onPointerDown={stopEvent}
        disabled={disabled}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        Tirar foto
      </Button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={stopEvent}
          onPointerDown={stopEvent}
        >
          <button
            type="button"
            onClick={(e) => { stopEvent(e); closeAll(); }}
            onPointerDown={stopEvent}
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative w-full max-w-sm aspect-[3/4] rounded-lg overflow-hidden bg-black border border-white/20">
            <video
              ref={handleVideoMount}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              onLoadedMetadata={markVideoReady}
              onLoadedData={markVideoReady}
              onCanPlay={markVideoReady}
              onPlaying={markVideoReady}
            />
            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/80">
                <Loader2 className="h-6 w-6 animate-spin" />
                Iniciando câmera...
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => { stopEvent(e); closeAll(); }}
              onPointerDown={stopEvent}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={capturePhoto}
              onPointerDown={stopEvent}
              disabled={capturing || !videoReady}
            >
              {capturing ? "Confirmando..." : "Confirmar"}
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
