/**
 * Card temporario de venda TEF para validar o pinpad PayGo sem passar pelo
 * fluxo completo de produtos/menu do PDV.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, Loader2, FlaskConical, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { loadTefConfig, createTefAdapter, logTefTransaction } from "@/lib/tef";
import type { TefStatus, TefPaymentMethod } from "@/lib/tef";
import { paygoConfirmarVenda } from "@/lib/tef/paygoAdapter";
import { joinAgentUrl } from "@/lib/tef/agentUrl";
import { pushTefReceipt } from "@/hooks/useTefReceipts";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";
const DEFAULT_SALE_ID = "VENDA-1001";

const isPaygoNetworkMenuRequest = (result: { status: string; message?: string; raw?: unknown }) => {
  const text = `${result.message ?? ""} ${JSON.stringify(result.raw ?? {})}`.toUpperCase();
  return result.status === "error" && text.includes("DEMO") && text.includes("REDE");
};

export default function TefTestSaleCard() {
  const [amount, setAmount] = useState("129,90");
  const [saleId, setSaleId] = useState(DEFAULT_SALE_ID);
  const [acquirer, setAcquirer] = useState<"DEMO" | "REDE" | "PIX C6 BANK">("DEMO");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TefStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");
  const [pendingMethod, setPendingMethod] = useState<TefPaymentMethod | null>(null);

  const runSale = async (method: TefPaymentMethod, selectedAcquirer?: "DEMO" | "REDE" | "PIX C6 BANK") => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor invalido", variant: "destructive" });
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
          title: "Loja nao esta com PayGo",
          description: `Provider atual: ${cfg.provider}. Ajuste em pdv_tef_config.`,
          variant: "destructive",
        });
        setBusy(false);
        setStatus("idle");
        return;
      }

      const adapter = createTefAdapter(cfg);
      const result = await adapter.processPayment(
        {
          amount: value,
          method,
          storeId: ASA_SUL_ID,
          acquirer: selectedAcquirer,
          orderId: saleId.trim() || DEFAULT_SALE_ID,
        },
        (s, msg) => {
          setStatus(s);
          if (msg) setStatusMsg(msg);
        },
      );

      setStatus(result.status);
      setStatusMsg(result.message ?? "");
      setLastResult(JSON.stringify(result, null, 2));

      const rawAny = (result.raw ?? {}) as any;
      const rawData = rawAny?.retorno?.data ?? rawAny?.data ?? {};
      const merchant = result.merchantReceipt || rawData.merchantReceipt || rawData.PWINFO_RCPTMERCH;
      const customer = result.customerReceipt || rawData.customerReceipt || rawData.PWINFO_RCPTCHOLDER;
      const reduced = rawData.reducedReceipt || rawData.PWINFO_CUPOMREDUZIDO;
      const diff1 = rawData.diffReceipt1 || rawData.PWINFO_CUPOMDIF1;
      const diff2 = rawData.diffReceipt2 || rawData.PWINFO_CUPOMDIF2;
      if (merchant || customer || reduced || diff1 || diff2) {
        pushTefReceipt({
          label: `${method === "credit" ? "Crédito" : "Débito"} ${selectedAcquirer ?? acquirer} · ${(saleId.trim() || DEFAULT_SALE_ID)} · R$ ${value.toFixed(2)}`,
          merchant,
          customer,
          reduced,
          diff1,
          diff2,
        });
      }

      if (!selectedAcquirer && isPaygoNetworkMenuRequest(result)) {
        setPendingMethod(method);
        return;
      }

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
        acquirer: result.acquirer ?? selectedAcquirer ?? acquirer,
        raw: result.raw,
      });

      toast({
        title: result.status === "approved" ? "Aprovado" : `Resultado: ${result.status}`,
        description: result.message ?? result.authorizationCode ?? result.nsu ?? "",
        variant: result.status === "approved" ? "default" : "destructive",
      });
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message ?? String(err));
      toast({
        title: "Erro na transacao",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const startSelectedNetworkSale = (selectedAcquirer: "DEMO" | "REDE" | "PIX C6 BANK") => {
    if (!pendingMethod) return;
    setAcquirer(selectedAcquirer);
    const method = pendingMethod;
    setPendingMethod(null);
    void runSale(method, selectedAcquirer);
  };

  const cancelNetworkSelection = async () => {
    setPendingMethod(null);
    try {
      const cfg = await loadTefConfig(ASA_SUL_ID);
      const adapter = createTefAdapter(cfg);
      await adapter.cancel();
    } catch {
      /* ignore */
    }
    setStatus("cancelled");
    setStatusMsg("Operacao PayGo cancelada pelo operador");
  };

  const resolverPendencia = async (action: "confirm" | "undo") => {
    setBusy(true);
    setStatus("processing");
    setStatusMsg(action === "confirm" ? "Confirmando transação pendente..." : "Desfazendo transação pendente...");
    try {
      const cfg = await loadTefConfig(ASA_SUL_ID);

      // Busca o token da última transação pendente da Asa Sul
      const { data: pendingRows } = await supabase
        .from("pdv_tef_transactions")
        .select("id, raw_response")
        .eq("store_id", ASA_SUL_ID)
        .eq("provider", "paygo")
        .eq("status", "pending_confirmation")
        .order("created_at", { ascending: false })
        .limit(1);

      const row = (pendingRows ?? [])[0];
      const raw: any = row?.raw_response ?? {};
      const d = raw?.retorno?.data ?? raw?.data ?? {};
      const token = {
        reqNum: d.reqNum ?? "",
        locRef: d.locRef ?? "",
        extRef: d.extRef ?? "",
        virtMerch: d.virtMerch ?? "",
        authSyst: d.authSyst ?? "",
      };

      const resp = await fetch(joinAgentUrl(cfg.agentUrl, action === "confirm" ? "/tef/confirm" : "/tef/undo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token),
      });
      const data = await resp.json().catch(() => ({} as any));

      if (resp.ok && data?.ok) {
        // Atualiza a transação no banco para sair do estado "pending"
        if (row?.id) {
          await supabase
            .from("pdv_tef_transactions")
            .update({
              status: action === "confirm" ? "approved" : "cancelled",
              message: action === "confirm" ? "Pendência confirmada manualmente" : "Pendência desfeita manualmente",
            })
            .eq("id", row.id);
        }
        setStatus(action === "confirm" ? "approved" : "cancelled");
        setStatusMsg(data?.message ?? `Pendência ${action === "confirm" ? "confirmada" : "desfeita"} com sucesso.`);
        toast({
          title: action === "confirm" ? "Pendência confirmada" : "Pendência desfeita",
          description: data?.message ?? "Pinpad liberado para próxima venda.",
        });
      } else {
        setStatus("error");
        setStatusMsg(data?.error ?? `Falha ao ${action === "confirm" ? "confirmar" : "desfazer"} pendência`);
        toast({
          title: "Falha",
          description: data?.error ?? `HTTP ${resp.status}`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message ?? String(err));
      toast({ title: "Erro", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  return (
    <Card className="p-4 space-y-3 border-warning/40 bg-warning/5">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-warning" />
        <h2 className="font-semibold">Venda de teste (temporario)</h2>
        <Badge variant="outline" className="ml-auto">ASA SUL</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Dispara uma transacao direto no pinpad usando o adapter PayGo da Asa Sul,
        com os mesmos parametros padrao do demo de referencia.
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

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Venda</label>
          <Input
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
            className="w-40"
            disabled={busy}
          />
        </div>

        <Button onClick={() => void runSale("debit")} disabled={busy || !!pendingMethod} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Debito
        </Button>

        <Button onClick={() => void runSale("credit")} disabled={busy || !!pendingMethod} variant="secondary" className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Credito
        </Button>

        <Button onClick={() => void runSale("pix", "PIX C6 BANK")} disabled={busy || !!pendingMethod} variant="outline" className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          PIX C6 BANK
        </Button>

        <Button
          onClick={() => void resolverPendencia("confirm")}
          disabled={busy || !!pendingMethod}
          variant="default"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar pendência
        </Button>

        <Button
          onClick={() => void resolverPendencia("undo")}
          disabled={busy || !!pendingMethod}
          variant="destructive"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Desfazer pendência
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

      <Dialog open={!!pendingMethod} onOpenChange={(open) => { if (!open) setPendingMethod(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Selecione a rede</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Button size="lg" className="h-12" onClick={() => startSelectedNetworkSale("DEMO")}>
              DEMO
            </Button>
            <Button size="lg" variant="secondary" className="h-12" onClick={() => startSelectedNetworkSale("REDE")}>
              REDE
            </Button>
            <Button variant="outline" className="h-11" onClick={() => void cancelNetworkSelection()}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
