import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CAMERA_READY_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      window.clearTimeout(timeoutId);
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("A câmera demorou para ficar pronta. Tente novamente."));
    }, CAMERA_READY_TIMEOUT_MS);

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    onReady();
  });
}

interface MaintenancePhotoCaptureButtonProps {
  disabled?: boolean;
  onCapture: (file: File) => void | Promise<void>;
  captureMode?: "environment" | "user" | false;
  onOpenIntent?: () => void;
}

/**
 * Componente compartilhado para captura de fotos em dispositivos móveis.
 * 
 * Correção técnica:
 * Mobile Safari e outros navegadores possuem restrições de segurança para disparo de
 * input file via .click() programático (especialmente se o input estiver hidden ou houver
 * manipulação de propagação de eventos).
 * 
 * Solução robusta:
 * 1. Usa <Label htmlFor={id}> nativo para disparar o input.
 * 2. Mantém o input acessível ao navegador com 'sr-only' em vez de 'hidden' (display: none).
 * 3. Remove stopPropagation que quebra a cadeia de confiança do gesto do usuário no mobile.
 */
export function MaintenancePhotoCaptureButton({
  disabled = false,
  onCapture,
  captureMode = "environment",
  onOpenIntent,
}: MaintenancePhotoCaptureButtonProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(previewBlob);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextUrl;
    });

    return () => URL.revokeObjectURL(nextUrl);
  }, [previewBlob]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const resetDialogState = useCallback(() => {
    stopCamera();
    setPreviewBlob(null);
    setDialogOpen(false);
    setOpeningCamera(false);
    setProcessing(false);
  }, [stopCamera]);

  useEffect(() => {
    if (!dialogOpen || previewBlob || !streamRef.current) return;

    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const attachPreview = async (attempt = 0) => {
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) {
        if (attempt < 20) {
          retryTimeoutId = window.setTimeout(() => {
            void attachPreview(attempt + 1);
          }, 50);
        }
        return;
      }

      try {
        setCameraReady(false);
        video.srcObject = streamRef.current;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
        await waitForVideoReady(video);
        if (!cancelled) setCameraReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Falha ao iniciar preview da câmera:", error);
        toast.error("Não foi possível iniciar a câmera. Tente novamente.");
        resetDialogState();
      }
    };

    void attachPreview();

    return () => {
      cancelled = true;
      if (retryTimeoutId) window.clearTimeout(retryTimeoutId);
    };
  }, [dialogOpen, previewBlob, resetDialogState]);

  const runCaptureHandler = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("A foto deve ter no máximo 10MB.");
      return;
    }

    setProcessing(true);
    try {
      await onCapture(file);
    } catch (error: unknown) {
      console.error("Falha ao processar foto:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível usar a foto.");
      throw error;
    } finally {
      setProcessing(false);
    }
  };

  const openFallbackPicker = (notifyIntent = true) => {
    if (notifyIntent) onOpenIntent?.();
    inputRef.current?.click();
  };

  const openInlineCamera = async () => {
    onOpenIntent?.();

    const canUseInlineCamera =
      captureMode !== false &&
      typeof window !== "undefined" &&
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!canUseInlineCamera) {
      openFallbackPicker(false);
      return;
    }

    setOpeningCamera(true);
    setCameraReady(false);
    setPreviewBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: captureMode === "user" ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      stopCamera();
      streamRef.current = stream;
      setDialogOpen(true);
    } catch (error: unknown) {
      console.error("Falha ao abrir câmera inline:", error);
      toast.error("Não foi possível abrir a câmera. Use o botão Arquivo para escolher ou tirar uma foto pelo aparelho.");
    } finally {
      setOpeningCamera(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    event.target.value = "";

    if (!file) return;

    try {
      await runCaptureHandler(file);
    } catch {
      return;
    }
  };

  const takeSnapshot = async () => {
    const video = videoRef.current;
    if (!cameraReady || !video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Não foi possível capturar a foto.");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.9);
    });
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) {
      toast.error("Não foi possível gerar a foto.");
      return;
    }

    setPreviewBlob(blob);
    stopCamera();
  };

  const confirmSnapshot = async () => {
    if (!previewBlob) return;

    const file = new File([previewBlob], `foto-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    try {
      await runCaptureHandler(file);
      resetDialogState();
    } catch {
      // mantém preview aberto para nova tentativa
    }
  };

  const busy = disabled || openingCamera || processing;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={captureMode === false ? undefined : captureMode}
        className="sr-only"
        onChange={handleFileChange}
        disabled={busy}
      />

      <button
        type="button"
        onClick={openInlineCamera}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5 cursor-pointer select-none",
          busy && "opacity-50 pointer-events-none",
        )}
        disabled={busy}
      >
        {openingCamera || processing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        {openingCamera ? "Abrindo câmera..." : processing ? "Processando..." : "Tirar foto"}
      </button>

      <label
        htmlFor={id}
        onClick={() => onOpenIntent?.()}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5 cursor-pointer select-none",
          busy && "opacity-50 pointer-events-none",
        )}
      >
        <Camera className="h-4 w-4" />
        Arquivo
      </label>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialogState(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>Tirar foto</DialogTitle>
          </DialogHeader>

          <div className="px-4 pb-4 space-y-3">
            <div className="overflow-hidden rounded-md border border-border bg-muted aspect-[3/4] flex items-center justify-center">
              {previewUrl ? (
                <img src={previewUrl} alt="Pré-visualização da foto" className="h-full w-full object-cover" />
              ) : (
                <div className="relative h-full w-full">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Preparando câmera...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-end gap-2 sm:justify-end">
              <Button type="button" variant="ghost" onClick={resetDialogState} disabled={processing}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>

              {previewUrl ? (
                <Button type="button" onClick={confirmSnapshot} disabled={processing}>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar
                </Button>
              ) : (
                <Button type="button" onClick={takeSnapshot} disabled={!cameraReady || openingCamera || processing}>
                  {cameraReady ? <Camera className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  {cameraReady ? "Capturar" : "Preparando..."}
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
