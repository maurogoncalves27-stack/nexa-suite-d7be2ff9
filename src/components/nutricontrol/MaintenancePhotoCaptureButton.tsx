import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!dialogOpen || previewBlob || !streamRef.current || !videoRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    videoRef.current
      .play()
      .catch((error) => console.error("Falha ao iniciar preview da câmera:", error));
  }, [dialogOpen, previewBlob]);

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

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const resetDialogState = () => {
    stopCamera();
    setPreviewBlob(null);
    setDialogOpen(false);
    setOpeningCamera(false);
    setProcessing(false);
  };

  const runCaptureHandler = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }

    setProcessing(true);
    try {
      await onCapture(file);
    } catch (error: any) {
      console.error("Falha ao processar foto:", error);
      toast.error(error?.message ?? "Não foi possível usar a foto.");
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
    } catch (error: any) {
      console.error("Falha ao abrir câmera inline:", error);
      toast.error("Não foi possível abrir a câmera. Você pode escolher uma imagem do aparelho.");
      openFallbackPicker(false);
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
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("A câmera ainda não está pronta.");
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

  const retakeSnapshot = async () => {
    await openInlineCamera();
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
    <div className="inline-block">
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/*"
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
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-end gap-2 sm:justify-end">
              <Button type="button" variant="ghost" onClick={resetDialogState} disabled={processing}>
                <X className="h-4 w-4" />
                Fechar
              </Button>

              {previewUrl ? (
                <>
                  <Button type="button" variant="outline" onClick={retakeSnapshot} disabled={processing}>
                    <RefreshCw className="h-4 w-4" />
                    Refazer
                  </Button>
                  <Button type="button" onClick={confirmSnapshot} disabled={processing}>
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirmar
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={takeSnapshot} disabled={openingCamera || processing}>
                  <Camera className="h-4 w-4" />
                  Capturar
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
