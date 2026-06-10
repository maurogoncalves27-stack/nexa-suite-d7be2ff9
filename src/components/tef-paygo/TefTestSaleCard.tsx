/**
 * Card temporário de "Venda de Teste TEF" — dispara uma transação direto
 * no adapter PayGo da loja ASA SUL para validar o pinpad sem precisar
 * montar produto/menu no PDV. Pode ser removido após homologação.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, FlaskConical } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig, createTefAdapter, logTefTransaction } from "@/lib/tef";
import type { TefStatus, TefPaymentMethod } from "@/lib/tef";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

export default function TefTestSaleCard() {
  const [amount, setAmount] = useState("1,00");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TefStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");

  const runSale = async (method: TefPaymentMethod) => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setBusy(true);
    setStatus("connecting");
    setStatusMsg("Carregando config TEF da Asa Sul...");
    setLastResult("");
    try {
      const cfg = await loadTefConfig(ASA_SUL_ID);
      if (cfg.provider !== "paygo") {
        toast({
          title: "Loja não está com PayGo",
          description: `Provider atual: ${cfg.provider}. Ajuste em pdv_tef_config.`,
          variant: "destructive",
        });
        setBusy(false);
        setStatus("idle");
        return;
      }
      const adapter = createTefAdapter(cfg);
      const result = await adapter.processPayment(
        { amount: value, method, storeId: ASA_SUL_ID },
        (s, msg) => {
          setStatus(s);
          if (msg) setStatusMsg(msg);
        },
      );
      setStatus(result.status);
      setStatusMsg(result.message ?? "");
      setLastResult(JSON.stringify(result, null, 2));
      await logTefTransaction({
        storeId: ASA_SUL_ID,
        provider: cfg.provider,
        amount: value,
        status: result.status,
        message: result.message,
        nsu: result.nsu,
        authorizationCode: result.authorizationCode,
        cardBrand: result.cardBrand,
        cardLast4: result.cardLast4,
        installments: result.installments,
        acquirer: result.acquirer,
        raw: result.raw,
      });
      toast({
        title: result.status === "approved" ? "Aprovado ✅" : `Resultado: ${result.status}`,
        description: result.message ?? result.authorizationCode ?? result.nsu ?? "",
        variant: result.status === "approved" ? "default" : "destructive",
      });
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message ?? String(err));
      toast({ title: "Erro na transação", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-warning/40 bg-warning/5">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-warning" />
        <h2 className="font-semibold">Venda de teste (temporário)</h2>
        <Badge variant="outline" className="ml-auto">ASA SUL</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Dispara uma transação direto no pinpad usando o adapter PayGo da Asa Sul,
        sem passar pelo fluxo de produtos/menu do PDV. Use para validar o pinpad
        em modo DEMO. Pode remover este card depois da homologação.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Valor (R$)</label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
            disabled={busy}
          />
        </div>
        <Button onClick={() => runSale("credit")} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Crédito
        </Button>
        <Button onClick={() => runSale("debit")} disabled={busy} variant="secondary" className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Débito
        </Button>
      </div>

      {status !== "idle" && (
        <div className="rounded-md border bg-background p-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={status === "approved" ? "default" : "outline"}>{status}</Badge>
            {statusMsg && <span className="text-muted-foreground">{statusMsg}</span>}
          </div>
        </div>
      )}

      {lastResult && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver resposta completa
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 font-mono">
            {lastResult}
          </pre>
        </details>
      )}
    </Card>
  );
}
