import { useState, useId, type ChangeEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  const [capturing, setCapturing] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    
    // Reseta o valor para permitir capturar a mesma foto novamente se necessário
    event.target.value = "";

    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }

    setCapturing(true);
    try {
      await onCapture(file);
    } catch (error: any) {
      console.error("Falha ao processar foto:", error);
      toast.error(error?.message ?? "Não foi possível usar a foto.");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="inline-block">
      <input
        id={id}
        type="file"
        accept="image/*"
        capture={captureMode === false ? undefined : captureMode}
        className="sr-only"
        onChange={handleFileChange}
        disabled={disabled || capturing}
      />

      <Label
        htmlFor={id}
        onPointerDown={() => onOpenIntent?.()}
        onClick={() => onOpenIntent?.()}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5 cursor-pointer select-none",
          (disabled || capturing) && "opacity-50 pointer-events-none"
        )}
      >
        {capturing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        {capturing ? "Processando..." : "Tirar foto"}
      </Label>
    </div>
  );
}
