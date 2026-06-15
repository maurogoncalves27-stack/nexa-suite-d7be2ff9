import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import type { TefConfig, TefPaymentRequest, TefPaymentResult } from "@/lib/tef";

interface Props {
  open: boolean;
  request: TefPaymentRequest | null;
  onClose: () => void;
  onResult: (r: TefPaymentResult) => void;
  configOverride?: TefConfig | null;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const isPaygoNetworkMenuRequest = (result: TefPaymentResult) => {
  const text = `${result.message ?? ""} ${JSON.stringify(result.raw ?? {})}`.toUpperCase();
  return result.status === "error" && text.includes("DEMO") && text.includes("REDE");
};

export function TefPaymentDialog({ open, request, onClose, onResult, configOverride }: Props) {
  const { status, message, result, pay, cancel, reset } = useTefPayment();
  const [networkPromptOpen, setNetworkPromptOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setNetworkPromptOpen(false);
      reset();
      return;
    }

    if (request && !startedRef.current) {
      startedRef.current = true;
      void pay({ ...request, acquirer: undefined }, configOverride ?? undefined).then((paymentResult) => {
        if (isPaygoNetworkMenuRequest(paymentResult)) {
          setNetworkPromptOpen(true);
          return;
        }
        onResult(paymentResult);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const isFinal =
    status === "approved" || status === "declined" ||
    status === "cancelled" || status === "error" || status === "timeout";
  const isSelectingNetwork = Boolean(open && request && networkPromptOpen);

  const handleClose = async () => {
    if (isSelectingNetwork || !isFinal) await cancel();
    onClose();
  };

  const handleSelectAcquirer = (acquirer: "DEMO" | "REDE") => {
    if (!request) return;
    setNetworkPromptOpen(false);
    void pay({ ...request, acquirer }, configOverride ?? undefined).then(onResult);
  };

  const handleCancelNetworkSelection = async () => {
    await cancel();
    setNetworkPromptOpen(false);
    onResult({
      status: "cancelled",
      message: "Operacao PayGo cancelada pelo operador",
      raw: result?.raw,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void handleClose(); }}>
      <DialogContent className="sm:max-w-md text-center p-8" style={TEF_THEME_STYLE}>
        <div className="flex flex-col items-center gap-4 py-6">
          {isSelectingNetwork && (
            <CreditCard className="h-20 w-20 text-primary" />
          )}
          {!isSelectingNetwork && (status === "connecting" || status === "processing") && (
            <Loader2 className="h-20 w-20 text-primary animate-spin" />
          )}
          {!isSelectingNetwork && status === "waiting_card" && (
            <CreditCard className="h-20 w-20 text-primary animate-pulse" />
          )}
          {!isSelectingNetwork && status === "approved" && (
            <CheckCircle2 className="h-20 w-20 text-green-600" />
          )}
          {!isSelectingNetwork && (status === "declined" || status === "timeout") && (
            <XCircle className="h-20 w-20 text-destructive" />
          )}
          {!isSelectingNetwork && status === "error" && (
            <WifiOff className="h-20 w-20 text-destructive" />
          )}
          {!isSelectingNetwork && status === "cancelled" && (
            <X className="h-20 w-20 text-muted-foreground" />
          )}

          <h2 className="text-2xl font-bold">
            {isSelectingNetwork && "Selecione a rede"}
            {!isSelectingNetwork && status === "connecting" && "Conectando..."}
            {!isSelectingNetwork && status === "waiting_card" && "Aproxime, insira ou passe o cartao"}
            {!isSelectingNetwork && status === "processing" && "Processando..."}
            {!isSelectingNetwork && status === "approved" && "Pagamento aprovado!"}
            {!isSelectingNetwork && status === "declined" && "Pagamento negado"}
            {!isSelectingNetwork && status === "cancelled" && "Pagamento cancelado"}
            {!isSelectingNetwork && status === "error" && "Erro de comunicacao"}
            {!isSelectingNetwork && status === "timeout" && "Tempo esgotado"}
          </h2>

          {request && (
            <div className="text-3xl font-bold text-primary">{fmt(request.amount)}</div>
          )}

          {isSelectingNetwork && (
            <p className="text-muted-foreground">
              A PayGo solicitou a selecao da rede para continuar a venda.
            </p>
          )}

          {!isSelectingNetwork && message && <p className="text-muted-foreground">{message}</p>}

          {isSelectingNetwork && (
            <div className="grid w-full gap-3">
              <Button size="lg" className="h-14 text-lg" onClick={() => handleSelectAcquirer("DEMO")}>
                DEMO
              </Button>
              <Button size="lg" variant="secondary" className="h-14 text-lg" onClick={() => handleSelectAcquirer("REDE")}>
                REDE
              </Button>
              <Button variant="outline" size="lg" className="h-12" onClick={handleCancelNetworkSelection}>
                Cancelar
              </Button>
            </div>
          )}

          {result?.status === "approved" && (
            <div className="text-sm text-muted-foreground space-y-1 mt-2">
              {result.cardBrand && <div>{result.cardBrand} **** {result.cardLast4}</div>}
              {result.nsu && <div>NSU: {result.nsu}</div>}
              {result.authorizationCode && <div>Aut: {result.authorizationCode}</div>}
            </div>
          )}

          {!isFinal && !isSelectingNetwork && (
            <Button variant="outline" size="lg" className="mt-4" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {isFinal && !isSelectingNetwork && (
            <Button size="lg" className="mt-4 w-full h-14 text-lg" onClick={onClose}>
              {status === "approved" ? "Continuar" : "Fechar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
