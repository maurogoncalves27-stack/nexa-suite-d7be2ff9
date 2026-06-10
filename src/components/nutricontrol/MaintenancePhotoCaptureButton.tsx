import { useId, useState, type ChangeEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MaintenancePhotoCaptureButtonProps {
  disabled?: boolean;
  onCapture: (file: File) => void | Promise<void>;
}

export function MaintenancePhotoCaptureButton({
  disabled = false,
  onCapture,
}: MaintenancePhotoCaptureButtonProps) {
  const inputId = useId();
  const [capturing, setCapturing] = useState(false);

  const stopEvent = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
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
    <>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        disabled={disabled || capturing}
      />

      <label
        htmlFor={inputId}
        role="button"
        aria-disabled={disabled || capturing}
        onPointerDown={stopEvent}
        onClick={stopEvent}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5",
          (disabled || capturing) && "pointer-events-none opacity-50",
        )}
      >
        {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {capturing ? "Processando..." : "Tirar foto"}
      </label>
    </>
  );
}
