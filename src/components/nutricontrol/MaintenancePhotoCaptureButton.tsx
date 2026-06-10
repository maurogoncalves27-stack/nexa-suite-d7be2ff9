import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface MaintenancePhotoCaptureButtonProps {
  disabled?: boolean;
  onCapture: (file: File) => void | Promise<void>;
}

export function MaintenancePhotoCaptureButton({
  disabled = false,
  onCapture,
}: MaintenancePhotoCaptureButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [capturing, setCapturing] = useState(false);

  const stopEvent = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || capturing}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          stopEvent(e);
          inputRef.current?.click();
        }}
        onPointerDown={stopEvent}
        disabled={disabled || capturing}
        className="gap-1.5"
      >
        {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {capturing ? "Processando..." : "Tirar foto"}
      </Button>
    </>
  );
}
