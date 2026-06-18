/**
 * Card de venda de teste Payer (API Localhost via agente).
 */
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { payerAbort, payerPayment, payerResponse } from "@/lib/tef/payerAdapter";

const AGENT_URL = "https://127.0.0.1:3031";

type SaleStatus = "idle" | "busy" | "approved" | "rejected" | "aborted" | "error";

export default function PayerTestSaleCard() {
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaleStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [lastJson, setLastJson] = useState("");
  const pollRef = useRef<{ stop: boolean } | null>(null);

  useEffect(() => () => {
    if (pollRef.current) pollRef.current.stop = true;
  }, []);

  const stopPoll = () => {
    if (pollRef.current) pollRef.current.stop = true;
    pollRef.current = null;
  };

  const pollUntilDone = async () => {
    const ctl = { stop: false };
    pollRef.current = ctl;
    while (!ctl.stop) {
      try {
        const data = await payerResponse(AGENT_URL);
        const st = data?.retorno?.statusTransaction;
        if (st === "PENDING") {
          setStatusMsg("Aguardando Checkout Payer...");
        }
        if (["APPROVED", "REJECTED", "ABORTED"].includes(String(st))) {
          setLastJson(JSON.stringify(data.retorno, null, 2));
          if (st === "APPROVED") {
            setStatus("approved");
            setStatusMsg("Pagamento aprovado");
          } else if (st === "ABORTED") {
            setStatus("aborted");
            setStatusMsg("Operação abortada");
          } else {
            setStatus("rejected");
            setStatusMsg(data?.retorno?.message || "Pagamento recusado");
          }
          return;
        }
      } catch {
        /* segue polling */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const runPayment = async (payload: Record<string, unknown>) => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setBusy(true);
    setStatus("busy");
    setStatusMsg("Enviando ordem ao Checkout Payer...");
    setLastJson("");
    stopPoll();
    try {
      const start = await payerPayment(AGENT_URL, { value, wait: false, ...payload });
      if (!start?.ok) throw new Error(start?.error || "Falha ao iniciar pagamento");
      await pollUntilDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setStatusMsg(msg);
      toast({ title: "Erro Payer", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
      stopPoll();
    }
  };

  const onAbort = async () => {
    stopPoll();
    setBusy(true);
    try {
      await payerAbort(AGENT_URL);
      setStatus("aborted");
      setStatusMsg("Abort solicitado");
    } catch (e: unknown) {
      toast({ title: "Erro ao abortar", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = () => {
    if (status === "approved") return <Badge className="bg-green-600">approved</Badge>;
    if (status === "rejected") return <Badge variant="destructive">rejected</Badge>;
    if (status === "aborted") return <Badge variant="secondary">aborted</Badge>;
    if (status === "busy") return <Badge>processando</Badge>;
    if (status === "error") return <Badge variant="destructive">error</Badge>;
    return null;
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Venda de teste Payer</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Proxy para Checkout Payer (localhost:6060) via agente. Instale o Checkout e configure PAYER_EMAIL/PASSWORD no agente.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Valor (R$)</label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} placeholder="10" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => runPayment({
          paymentMethod: "CARD",
          paymentType: "DEBIT",
          paymentMethodSubType: "FULL_PAYMENT",
        })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Débito
        </Button>
        <Button disabled={busy} variant="secondary" onClick={() => runPayment({
          paymentMethod: "CARD",
          paymentType: "CREDIT",
          paymentMethodSubType: "FULL_PAYMENT",
        })}>
          Crédito
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => runPayment({ paymentMethod: "PIX" })}>
          PIX
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => runPayment({})}>
          Simples
        </Button>
        <Button disabled={busy} variant="ghost" onClick={onAbort}>
          Abortar
        </Button>
      </div>

      {(status !== "idle" || statusMsg) && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-start gap-2">
          {status === "approved" ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" /> : null}
          {status === "error" || status === "rejected" ? <XCircle className="h-4 w-4 text-destructive mt-0.5" /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge()}
              <span>{statusMsg}</span>
            </div>
            {lastJson ? (
              <pre className="mt-2 text-[10px] overflow-auto max-h-40 font-mono whitespace-pre-wrap">{lastJson}</pre>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
