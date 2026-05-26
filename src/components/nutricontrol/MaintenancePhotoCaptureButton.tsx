import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [open, setOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* noop */
      }
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const attachStream = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay pode falhar silenciosamente — onCanPlay/onLoadedMetadata cobrem o resto */
    }
  }, []);

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
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
      console.error("Falha ao abrir câmera da manutenção:", error);
      const msg =
        error?.name === "NotAllowedError"
          ? "Permita o acesso à câmera nas configurações do navegador."
          : error?.name === "NotFoundError"
            ? "Nenhuma câmera encontrada neste aparelho."
            : error?.name === "NotReadableError"
              ? "A câmera está sendo usada por outro app. Feche-o e tente novamente."
              : (error?.message ?? "Não foi possível abrir a câmera.");
      toast.error(msg);
      stopCamera();
      setOpen(false);
    } finally {
      startingRef.current = false;
    }
  }, [attachStream, stopCamera]);

  // Callback ref garante iniciar a câmera assim que o <video> entra no DOM
  const handleVideoMount = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (!node) return;
      if (streamRef.current) {
        void attachStream(streamRef.current);
      } else {
        void startCameraStream();
      }
    },
    [attachStream, startCameraStream],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      stopCamera();
    }
    setOpen(next);
  };

  const capturePhoto = async () => {
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
      if (!ctx) {
        toast.error("Não foi possível preparar a foto.");
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
      );
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) {
        toast.error("Não foi possível capturar a foto.");
        return;
      }
      onCapture(
        new File([blob], `manutencao-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
      stopCamera();
      setOpen(false);
    } catch (error: any) {
      console.error("Falha ao capturar foto da manutenção:", error);
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
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        Tirar foto
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar foto</DialogTitle>
            <DialogDescription>
              Tire a foto sem sair da tela para evitar o retorno à home no mobile.
            </DialogDescription>
          </DialogHeader>

          <div className="relative overflow-hidden rounded-md border border-border bg-muted aspect-[3/4]">
            <video
              ref={handleVideoMount}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              onLoadedMetadata={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
            />
            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Iniciando câmera...
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={capturePhoto} disabled={capturing || !videoReady}>
              {capturing ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}