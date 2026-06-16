import { useCallback, useRef, useState } from "react";
import {
  createTefAdapter,
  loadTefConfig,
  logTefTransaction,
  type TefAdapter,
  type TefConfig,
  type TefPaymentRequest,
  type TefPaymentResult,
  type TefStatus,
} from "@/lib/tef";

/**
 * Hook para orquestrar pagamento via pinpad (TEF).
 * Carrega config da loja, cria adapter, dispara venda e registra log.
 */
export function useTefPayment() {
  const [status, setStatus] = useState<TefStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<TefPaymentResult | null>(null);
  const adapterRef = useRef<TefAdapter | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setMessage("");
    setResult(null);
    adapterRef.current = null;
  }, []);

  const pay = useCallback(async (req: TefPaymentRequest, configOverride?: TefConfig): Promise<TefPaymentResult> => {
    const config = configOverride ?? (await loadTefConfig(req.storeId));
    const adapter = createTefAdapter(config);
    adapterRef.current = adapter;

    setStatus("connecting");
    setMessage("");
    setResult(null);

    const res = await adapter.processPayment(req, (s, m) => {
      setStatus(s);
      if (m) setMessage(m);
    });

    setResult(res);
    setStatus(res.status);
    if (res.message) setMessage(res.message);

    // Log assíncrono (não bloqueia o fluxo)
    void logTefTransaction({
      orderId: req.orderId,
      storeId: req.storeId,
      provider: config.provider,
      amount: req.amount,
      status: res.status,
      message: res.message,
      nsu: res.nsu,
      authorizationCode: res.authorizationCode,
      cardBrand: res.cardBrand,
      cardLast4: res.cardLast4,
      installments: res.installments,
      acquirer: res.acquirer ?? config.acquirer,
      method: req.method,
      raw: res.raw,
    });

    return res;
  }, []);

  const cancel = useCallback(async () => {
    await adapterRef.current?.cancel();
  }, []);

  return { status, message, result, pay, cancel, reset };
}
