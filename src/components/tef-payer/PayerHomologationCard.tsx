/**
 * Roteiro de homologação Payer — cenários da tela oficial do Checkout.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListChecks, Copy, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { logTefTransaction } from "@/lib/tef";
import { payerCancellation, DEFAULT_PAYER_AGENT_URL } from "@/lib/tef/payer";
import { runPayerPaymentFlow, pollPayerResponse, extractIdPayer, type PayerFlowResult } from "./payerPaymentFlow";

interface Props {
  agentUrl?: string;
  storeId?: string;
  lastIdPayer?: string;
  onIdPayer?: (id: string) => void;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export default function PayerHomologationCard({
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  storeId,
  lastIdPayer = "",
  onIdPayer,
}: Props) {
  const [amount, setAmount] = useState("10");
  const [installments, setInstallments] = useState("2");
  const [paymentDate, setPaymentDate] = useState(fmtDate(new Date(Date.now() + 7 * 86400000)));
  const [idPayerDraft, setIdPayerDraft] = useState(lastIdPayer);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [lastJson, setLastJson] = useState("");
  const [lastStatus, setLastStatus] = useState<"idle" | "approved" | "rejected" | "aborted" | "error">("idle");

  useEffect(() => {
    if (lastIdPayer) setIdPayerDraft(lastIdPayer);
  }, [lastIdPayer]);

  const value = () => Number(amount.replace(",", "."));
  const inst = () => Math.max(2, Number(installments) || 2);

  const finish = (result: PayerFlowResult, method: string) => {
    setLastStatus(result.status === "approved" ? "approved" : result.status);
    setStatusMsg(result.message);
    if (result.retorno) setLastJson(JSON.stringify(result.retorno, null, 2));
    if (result.idPayer) {
      setIdPayerDraft(result.idPayer);
      onIdPayer?.(result.idPayer);
    }
    void logTefTransaction({
      storeId,
      provider: "payer",
      amount: value(),
      status: result.status === "approved" ? "approved" : result.status,
      method,
      message: result.message,
      nsu: result.retorno ? String(result.retorno.nsu ?? result.retorno.NSU ?? "") || undefined : undefined,
      raw: result.retorno,
    });
    if (result.status === "approved") {
      toast({ title: "Homologação", description: `${method} aprovado. idPayer: ${result.idPayer ?? "—"}` });
    } else if (result.status === "rejected") {
      toast({ title: "Recusado", description: result.message });
    } else if (result.status === "error") {
      toast({ title: "Erro", description: result.message, variant: "destructive" });
    }
  };

  const run = async (payload: Record<string, unknown>, method: string) => {
    const v = value();
    if (payload.paymentMethod !== "CASH" && (!v || v <= 0)) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setBusy(true);
    setLastStatus("idle");
    setStatusMsg("");
    setLastJson("");
    try {
      const result = await runPayerPaymentFlow(
        agentUrl,
        { value: v, ...payload },
        setStatusMsg,
      );
      finish(result, method);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastStatus("error");
      setStatusMsg(msg);
      toast({ title: "Erro Payer", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runCancel = async () => {
    const id = idPayerDraft.trim();
    if (!id) {
      toast({ title: "idPayer obrigatório", description: "Cole o idPayer de um pagamento aprovado.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setStatusMsg("Solicitando estorno...");
    try {
      const start = await payerCancellation(agentUrl, id);
      if (!start?.ok) throw new Error(start?.error || "Falha ao iniciar estorno");
      const result = await pollPayerResponse(agentUrl, setStatusMsg);
      finish(result, "cancellation");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastStatus("error");
      setStatusMsg(msg);
      toast({ title: "Erro no estorno", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copyId = () => {
    if (!idPayerDraft) return;
    void navigator.clipboard.writeText(idPayerDraft);
    toast({ title: "Copiado", description: "idPayer copiado." });
  };

  const Btn = ({ label, onClick, variant = "outline" as const }: { label: string; onClick: () => void; variant?: "default" | "secondary" | "outline" | "ghost" }) => (
    <Button size="sm" variant={variant} disabled={busy} onClick={onClick}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
      {label}
    </Button>
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Roteiro homologação Payer</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Cenários da tela <strong>Homologação</strong> do Checkout. Após cada aprovação, use o <code className="text-xs">idPayer</code> para estornar.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Valor (R$)</label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Parcelas</label>
          <Input value={installments} onChange={(e) => setInstallments(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Data pré-datado</label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={busy} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pagamentos pendentes</p>
        <div className="flex flex-wrap gap-2">
          <Btn label="Crédito à vista" variant="secondary" onClick={() => run({
            paymentMethod: "CARD", paymentType: "CREDIT", paymentMethodSubType: "FULL_PAYMENT",
          }, "credit")} />
          <Btn label="Dinheiro" onClick={() => run({ paymentMethod: "CASH" }, "cash")} />
          <Btn label="Créd. Parc. Lojista" onClick={() => run({
            paymentMethod: "CARD", paymentType: "CREDIT", paymentMethodSubType: "FINANCED_NO_FEES", installments: inst(),
          }, "credit_installment_merchant")} />
          <Btn label="Créd. Parc. Admin" onClick={() => run({
            paymentMethod: "CARD", paymentType: "CREDIT", paymentMethodSubType: "FINANCED_WITH_FEES", installments: inst(),
          }, "credit_installment_admin")} />
          <Btn label="Débito Pré-Datado" onClick={() => run({
            paymentMethod: "CARD", paymentType: "DEBIT", paymentMethodSubType: "PREDATED_DEBIT", paymentDate,
          }, "debit_predated")} />
          <Btn label="Débito Parcelado" onClick={() => run({
            paymentMethod: "CARD", paymentType: "DEBIT", paymentMethodSubType: "FINANCED_DEBIT", installments: inst(), paymentDate,
          }, "debit_installment")} />
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cancelamentos</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">idPayer (pagamento aprovado)</label>
            <Input
              value={idPayerDraft}
              onChange={(e) => setIdPayerDraft(e.target.value)}
              disabled={busy}
              placeholder="ex: 20260628100658"
              className="font-mono text-xs"
            />
          </div>
          <Button size="sm" variant="ghost" disabled={!idPayerDraft} onClick={copyId}>
            <Copy className="h-4 w-4" />
          </Button>
          <Btn label="Estornar (CANCELLMENT)" variant="default" onClick={runCancel} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Repita o estorno para cada modalidade já aprovada (débito, crédito, PIX, dinheiro…).
        </p>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Rejeitadas:</strong> use cartão de teste que a Payer indicar para recusa,
        ou configure recusa no simulador (Meus Serviços). Abortar no pinpad não conta como rejeitada.
      </div>

      {(statusMsg || lastJson) && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-start gap-2">
          {lastStatus === "approved" ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> : null}
          {lastStatus === "rejected" || lastStatus === "error" ? <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {lastStatus !== "idle" ? <Badge variant={lastStatus === "approved" ? "default" : "secondary"}>{lastStatus}</Badge> : null}
              <span>{statusMsg}</span>
            </div>
            {lastJson ? (
              <pre className="mt-2 text-[10px] overflow-auto max-h-48 font-mono whitespace-pre-wrap">{lastJson}</pre>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
