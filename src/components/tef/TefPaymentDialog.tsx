import { useEffect, type CSSProperties } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const TEF_THEME_STYLE = {
  "--primary": "0 82% 43%",
  "--primary-foreground": "0 0% 100%",
  "--ring": "0 82% 43%",
  "--accent": "6 84% 54%",
  "--accent-foreground": "0 0% 100%",
} as CSSProperties;
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, XCircle, Loader2, WifiOff, X } from "lucide-react";
import { useTefPayment } from "@/hooks/useTefPayment";
import type { TefPaymentRequest, TefPaymentResult } from "@/lib/tef";

interface Props {
  open: boolean;
  request: TefPaymentRequest | null;
  onClose: () => void;
  onResult: (r: TefPaymentResult) => void;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TefPaymentDialog({ open, request, onClose, onResult }: Props) {
  const { status, message, result, pay, cancel, reset } = useTefPayment();

  useEffect(() => {
    if (open && request) {
      void pay(request).then(onResult);
    }
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const isFinal =
    status === "approved" || status === "declined" ||
    status === "cancelled" || status === "error" || status === "timeout";

  const handleClose = async () => {
    if (!isFinal) await cancel();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void handleClose(); }}>
      <DialogContent className="sm:max-w-md text-center p-8" style={TEF_THEME_STYLE}>
        <div className="flex flex-col items-center gap-4 py-6">
          {(status === "connecting" || status === "processing") && (
            <Loader2 className="h-20 w-20 text-primary animate-spin" />
          )}
          {status === "waiting_card" && (
            <CreditCard className="h-20 w-20 text-primary animate-pulse" />
          )}
          {status === "approved" && (
            <CheckCircle2 className="h-20 w-20 text-green-600" />
          )}
          {(status === "declined" || status === "timeout") && (
            <XCircle className="h-20 w-20 text-destructive" />
          )}
          {status === "error" && (
            <WifiOff className="h-20 w-20 text-destructive" />
          )}
          {status === "cancelled" && (
            <X className="h-20 w-20 text-muted-foreground" />
          )}

          <h2 className="text-2xl font-bold">
            {status === "connecting" && "Conectando..."}
            {status === "waiting_card" && "Aproxime, insira ou passe o cartão"}
            {status === "processing" && "Processando..."}
            {status === "approved" && "Pagamento aprovado!"}
            {status === "declined" && "Pagamento negado"}
            {status === "cancelled" && "Pagamento cancelado"}
            {status === "error" && "Erro de comunicação"}
            {status === "timeout" && "Tempo esgotado"}
          </h2>

          {request && (
            <div className="text-3xl font-bold text-primary">{fmt(request.amount)}</div>
          )}

          {message && <p className="text-muted-foreground">{message}</p>}

          {result?.status === "approved" && (
            <div className="text-sm text-muted-foreground space-y-1 mt-2">
              {result.cardBrand && <div>{result.cardBrand} **** {result.cardLast4}</div>}
              {result.nsu && <div>NSU: {result.nsu}</div>}
              {result.authorizationCode && <div>Aut: {result.authorizationCode}</div>}
            </div>
          )}

          {!isFinal && (
            <Button variant="outline" size="lg" className="mt-4" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {isFinal && (
            <Button size="lg" className="mt-4 w-full h-14 text-lg" onClick={onClose}>
              {status === "approved" ? "Continuar" : "Fechar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
