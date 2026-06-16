/**
 * Card temporario de venda TEF para validar o pinpad PayGo sem passar pelo
 * fluxo completo de produtos/menu do PDV.
 */
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CreditCard, Loader2, FlaskConical, CheckCircle2, XCircle, Settings2, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { loadTefConfig, createTefAdapter, logTefTransaction } from "@/lib/tef";
import type { TefStatus, TefPaymentMethod } from "@/lib/tef";
import { joinAgentUrl } from "@/lib/tef/agentUrl";
import { paygoCancelarVenda } from "@/lib/tef/paygoAdapter";
import { pushTefReceipt } from "@/hooks/useTefReceipts";
import TefPinpadSetupCard from "./TefPinpadSetupCard";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";
const DEFAULT_SALE_ID = "VENDA-1001";

interface Props {
  storeId?: string | null;
  cpfCnpj?: string | null;
  pontoDeCaptura?: string | null;
  sandboxHost?: string | null;
}

const isPaygoNetworkMenuRequest = (result: { status: string; message?: string; raw?: unknown }) => {
  const text = `${result.message ?? ""} ${JSON.stringify(result.raw ?? {})}`.toUpperCase();
  return result.status === "error" && text.includes("DEMO") && text.includes("REDE");
};

export default function TefTestSaleCard({ storeId, cpfCnpj, pontoDeCaptura, sandboxHost }: Props) {
  const [amount, setAmount] = useState("");
  const [saleId, setSaleId] = useState(DEFAULT_SALE_ID);
  const [installments, setInstallments] = useState("1");
  const [acquirer, setAcquirer] = useState<"DEMO" | "REDE" | "PIX C6 BANK">("DEMO");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TefStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");
  const [pendingMethod, setPendingMethod] = useState<TefPaymentMethod | null>(null);
  const [showPinpad, setShowPinpad] = useState(false);
  const [qrDisplayPreference, setQrDisplayPreference] = useState<"1" | "2">("2");
  const [pixQrBrCode, setPixQrBrCode] = useState<string>("");
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string>("");
  const [pixWaitMsg, setPixWaitMsg] = useState<string>("");
  const [pixSaleInfo, setPixSaleInfo] = useState<string>("");
  const pollAbortRef = useRef<{ stop: boolean } | null>(null);
  const latestPixQrRef = useRef("");

  // Renderiza QR sempre que receber novo BR Code
  useEffect(() => {
    latestPixQrRef.current = pixQrBrCode;
    if (!pixQrBrCode) { setPixQrDataUrl(""); return; }
    QRCode.toDataURL(pixQrBrCode, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then(setPixQrDataUrl)
      .catch(() => setPixQrDataUrl(""));
  }, [pixQrBrCode]);

  // Faz polling de /tef/sale/status enquanto a transacao PIX esta em andamento.
  // O pinpad PPC930 nao tem display grafico — quem renderiza o QR e' essa UI.
  const startPixPolling = async () => {
    try {
      const cfg = await loadTefConfig(ASA_SUL_ID);
      const ctl = { stop: false };
      pollAbortRef.current = ctl;
      while (!ctl.stop) {
        try {
          const r = await fetch(joinAgentUrl(cfg.agentUrl, "/tef/sale/status"), {
            signal: AbortSignal.timeout(2500),
          });
          if (r.ok) {
            const data = await r.json().catch(() => ({} as any));
            if (data?.qrCode && data.qrCode !== pixQrBrCode) setPixQrBrCode(data.qrCode);
            if (data?.message) setPixWaitMsg(String(data.message));
            if (data?.status === "done" || data?.status === "error" || data?.status === "idle") break;
          }
        } catch { /* ignora — segue tentando */ }
        await new Promise((res) => setTimeout(res, 700));
      }
    } catch { /* ignore */ }
  };

  const stopPixPolling = () => {
    if (pollAbortRef.current) pollAbortRef.current.stop = true;
    pollAbortRef.current = null;
  };

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
    setPixQrBrCode("");
    setPixWaitMsg("");

    // PIX nao aparece no PPC930 (sem display grafico) — a automacao tem que mostrar o QR.
    if (method === "pix") void startPixPolling();

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
      const parsedInst = Math.max(1, Math.min(99, parseInt(installments, 10) || 1));
      const result = await adapter.processPayment(
        {
          amount: value,
          method,
          storeId: ASA_SUL_ID,
          acquirer: selectedAcquirer,
          orderId: saleId.trim() || DEFAULT_SALE_ID,
          installments: method === "credit" ? parsedInst : 1,
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
        method,
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
      stopPixPolling();
      setPixQrBrCode("");
      setPixWaitMsg("");
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
    stopPixPolling();
    setPixQrBrCode("");
    setPixWaitMsg("");
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
        // Tenta extrair authCode/nsu retornados pelo /tef/confirm (se houver)
        const cd = data?.data ?? data?.retorno?.data ?? {};
        const newAuth = cd.authCode || cd.authorizationCode || "";
        const newNsu = cd.reqNum || cd.nsu || "";
        // Atualiza a transação no banco para sair do estado "pending"
        if (row?.id) {
          const patch: any = {
            status: action === "confirm" ? "approved" : "cancelled",
            message: action === "confirm" ? "Pendência confirmada manualmente" : "Pendência desfeita manualmente",
            raw_response: { ...(raw || {}), confirmResult: data },
          };
          if (action === "confirm" && newAuth) patch.authorization_code = newAuth;
          if (action === "confirm" && newNsu) patch.nsu = newNsu;
          await supabase
            .from("pdv_tef_transactions")
            .update(patch)
            .eq("id", row.id);
        }
        setStatus(action === "confirm" ? "approved" : "cancelled");
        const note = action === "confirm" && !newAuth
          ? " (PayGo não retornou novo código de autorização para esta confirmação manual)"
          : "";
        setStatusMsg((data?.message ?? `Pendência ${action === "confirm" ? "confirmada" : "desfeita"} com sucesso.`) + note);
        toast({
          title: action === "confirm" ? "Pendência confirmada" : "Pendência desfeita",
          description: (data?.message ?? "Pinpad liberado para próxima venda.") + note,
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
  const cancelarUltimaVenda = async () => {
    setBusy(true);
    setStatus("processing");
    setStatusMsg("Buscando última venda aprovada da Asa Sul...");
    try {
      const cfg = await loadTefConfig(ASA_SUL_ID);
      const { data: rows } = await supabase
        .from("pdv_tef_transactions")
        .select("id, nsu, amount, created_at, raw_response")
        .eq("store_id", ASA_SUL_ID)
        .eq("provider", "paygo")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1);
      const row = (rows ?? [])[0];
      if (!row || !row.nsu) {
        toast({ title: "Nenhuma venda aprovada encontrada", variant: "destructive" });
        setStatus("idle");
        setStatusMsg("");
        return;
      }
      const dt = new Date(row.created_at);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yyyy = String(dt.getFullYear());
      const dataDDMMAAAA = `${dd}${mm}${yyyy}`;
      setStatusMsg(`Cancelando NSU ${row.nsu} de ${dd}/${mm}/${yyyy} (R$ ${Number(row.amount).toFixed(2)})...`);
      const resp = await paygoCancelarVenda(cfg.agentUrl, {
        nsu: String(row.nsu),
        data: dataDDMMAAAA,
        valor: Number(row.amount),
      });
      if (resp.ok) {
        setStatus("cancelled");
        setStatusMsg(resp.message ?? "Cancelamento aprovado.");
        await supabase
          .from("pdv_tef_transactions")
          .update({ status: "cancelled", message: "Cancelado via venda de teste" })
          .eq("id", row.id);
        toast({ title: "Cancelamento aprovado", description: `NSU ${row.nsu}` });
      } else {
        setStatus("error");
        setStatusMsg(resp.error ?? "Falha no cancelamento");
        toast({ title: "Falha no cancelamento", description: resp.error ?? "", variant: "destructive" });
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
            placeholder="0,00"
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

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Parcelas (crédito)</label>
          <Input
            type="number"
            min={1}
            max={99}
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            className="w-24"
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

        <Button
          onClick={() => void cancelarUltimaVenda()}
          disabled={busy || !!pendingMethod}
          variant="destructive"
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Cancelar última venda
        </Button>

        <Button
          onClick={() => setShowPinpad((s) => !s)}
          disabled={busy}
          variant="outline"
          className="gap-2"
        >
          <Settings2 className="h-4 w-4" />
          {showPinpad ? "Ocultar menu pinpad" : "Menu pinpad"}
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

      <Dialog open={!!pixQrDataUrl} onOpenChange={(open) => { if (!open) { void cancelNetworkSelection(); setPixQrBrCode(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Pague com Pix</DialogTitle>
            <DialogDescription>
              {pixWaitMsg || "Cliente, escaneie este QR Code no app do seu banco para concluir o pagamento."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {pixQrDataUrl && (
              <img src={pixQrDataUrl} alt="QR Code Pix" className="rounded border bg-white p-2" width={320} height={320} />
            )}
            <details className="w-full text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Mostrar BR Code (Pix copia-e-cola)</summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 font-mono break-all whitespace-pre-wrap">{pixQrBrCode}</pre>
            </details>
            <Button variant="destructive" className="w-full" onClick={() => void cancelNetworkSelection()}>
              Cancelar transação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {showPinpad && (
        <TefPinpadSetupCard
          storeId={storeId}
          cpfCnpj={cpfCnpj}
          pontoDeCaptura={pontoDeCaptura}
          sandboxHost={sandboxHost}
        />
      )}
    </Card>
  );
}
