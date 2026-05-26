import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

interface QrCodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}

export const QrCodeScanner = ({ open, onClose, onScan }: QrCodeScannerProps) => {
  const containerId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      setStarting(true);
      try {
        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            if (cancelled) return;
            cancelled = true;
            scanner.stop().catch(() => {});
            onScan(decoded);
          },
          () => {
            // ignore decode errors per frame
          },
        );
      } catch (err) {
        toast.error("Não foi possível abrir a câmera. Verifique permissões.");
        console.error(err);
        onClose();
      } finally {
        setStarting(false);
      }
    };
    const t = setTimeout(start, 50); // wait for DOM
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear?.();
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Escanear QR Code
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera para o QR Code do DANFE ou de um boleto.
          </DialogDescription>
        </DialogHeader>
        <div id={containerId} className="w-full rounded-md overflow-hidden bg-muted" />
        {starting && <p className="text-sm text-muted-foreground text-center">Abrindo câmera…</p>}
        <Button variant="outline" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" /> Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default QrCodeScanner;
