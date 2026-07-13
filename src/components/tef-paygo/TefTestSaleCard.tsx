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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Loader2, FlaskConical, CheckCircle2, XCircle, QrCode, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig, createTefAdapter, upsertTefTransactionAudit, findPendingTefTransactionByReqnum, findTefTransactionByReqnum, buildPaygoAuditRaw, buildTefAuditSaleId } from "@/lib/tef";
import {
  formatPendingAmountLabel,
  formatPendingReason,
  parseAmountCentavosFromReceipt,
  resolvePendingModalKind,
  type PendingModalKind,
} from "@/lib/tef/pendingDisplay";
import type { TefStatus } from "@/lib/tef";
import { joinAgentUrl } from "@/lib/tef/agentUrl";
import { pushTefReceipt } from "@/hooks/useTefReceipts";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";
const DEFAULT_SALE_ID = "VENDA-1001";
/** Primeira carga da página TEF PayGo na sessão do navegador — valor zerado. */
const TEF_PAYGO_SESSION_INIT_KEY = "tef-paygo:page:session-init";

interface Props {
  storeId?: string | null;
}

interface SaleCapture {
  interactionId?: string;
  captureType?: string;
  identificador: number;
  tipo: number;
  prompt: string;
  options?: { label: string; value: string }[];
  tamMin?: number;
  tamMax?: number;
  mascara?: string;
  ocultar?: boolean;
  seq?: number;
}

interface ApiPayment {
  id: string;
  saleId: string;
  amountInCents: number;
  status: string;
  message?: string;
  nsu?: string | null;
  authorizationCode?: string | null;
  brand?: string | null;
  acquirer?: string | null;
  customerReceipt?: string | null;
  merchantReceipt?: string | null;
  customerReceiptShort?: string | null;
  customerReceiptHolder?: string | null;
  customerReceiptFull?: string | null;
  merchantReceiptMerch?: string | null;
  merchantReceiptFull?: string | null;
  paygo?: {
    reqNum?: string;
    locRef?: string;
    extRef?: string;
    virtMerch?: string;
    authSyst?: string;
  } | null;
  interaction?: {
    id: string;
    kind: "menu" | "input";
    prompt: string;
    identifier?: string;
    options?: { label: string; value: string }[];
    inputType?: "text" | "password" | "number";
    minLength?: number;
    maxLength?: number;
  } | null;
}

const STATUS_STYLE: Record<TefStatus, { kind: "idle" | "processing" | "success" | "error"; panelClass: string }> = {
  idle: { kind: "idle", panelClass: "bg-muted/50 text-muted-foreground border-border" },
  connecting: { kind: "processing", panelClass: "bg-amber-50 text-amber-900 border-amber-200" },
  waiting_card: { kind: "processing", panelClass: "bg-amber-50 text-amber-900 border-amber-200" },
  processing: { kind: "processing", panelClass: "bg-amber-50 text-amber-900 border-amber-200" },
  approved: { kind: "success", panelClass: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  declined: { kind: "error", panelClass: "bg-rose-50 text-rose-900 border-rose-200" },
  cancelled: { kind: "error", panelClass: "bg-rose-50 text-rose-900 border-rose-200" },
  error: { kind: "error", panelClass: "bg-rose-50 text-rose-900 border-rose-200" },
  timeout: { kind: "error", panelClass: "bg-orange-50 text-orange-900 border-orange-200" },
  pending_confirmation: { kind: "processing", panelClass: "bg-amber-50 text-amber-900 border-amber-200" },
};

const mapApiStatusToUi = (status?: string): TefStatus => {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMADA") return "approved";
  if (s === "APROVADA_NAO_CONFIRMADA" || s === "PENDENTE_CONFIRMACAO") return "pending_confirmation";
  if (s === "ENVIADA_AO_TEF") return "connecting";
  if (s === "AGUARDANDO_PINPAD" || s === "CRIADA") return "waiting_card";
  if (s === "NEGADA") return "declined";
  if (s === "CANCELADA" || s === "DESFEITA") return "cancelled";
  if (s === "TIMEOUT") return "timeout";
  if (s === "ERRO_COMUNICACAO") return "error";
  return "processing";
};

interface AgentPendingConfirmation {
  reqNum: string;
  locRef: string;
  extRef: string;
  virtMerch: string;
  authSyst: string;
  sourceStatus?: string;
  reason?: string;
  createdAt?: string;
  amountCentavos?: number;
  saleId?: string;
}

const isPendingEventMessage = (message?: string) =>
  /pendente de confirma|pendência paygo|pendencia paygo/i.test(String(message || ""));

const isPaygoPendingApiStatus = (status?: string) => {
  const s = String(status || "").toUpperCase();
  return s === "PENDENTE_CONFIRMACAO" || s === "APROVADA_NAO_CONFIRMADA";
};

const buildPaymentFromAgentPending = (pending: AgentPendingConfirmation): ApiPayment => ({
  id: "",
  saleId: pending.saleId || DEFAULT_SALE_ID,
  amountInCents: Number(pending.amountCentavos || 0),
  status: "PENDENTE_CONFIRMACAO",
  message: formatPendingReason(pending.reason),
  nsu: pending.reqNum,
  authorizationCode: pending.extRef || null,
  acquirer: pending.authSyst || null,
  paygo: {
    reqNum: pending.reqNum,
    locRef: pending.locRef,
    extRef: pending.extRef,
    virtMerch: pending.virtMerch,
    authSyst: pending.authSyst,
  },
});

const auditTxStorageKey = (storeId: string, reqNum: string) =>
  `tef-paygo:audit-tx:${storeId}:${reqNum}`;

const loadStoredAuditTxId = (storeId: string, reqNum?: string | null): string | null => {
  if (!reqNum) return null;
  try {
    return window.sessionStorage.getItem(auditTxStorageKey(storeId, reqNum));
  } catch {
    return null;
  }
};

const storeAuditTxId = (storeId: string, reqNum: string | undefined | null, id: string) => {
  if (!reqNum || !id) return;
  try {
    window.sessionStorage.setItem(auditTxStorageKey(storeId, reqNum), id);
  } catch {
    /* ignore */
  }
};

const clearStoredAuditTxId = (storeId: string, reqNum?: string | null) => {
  if (!reqNum) return;
  try {
    window.sessionStorage.removeItem(auditTxStorageKey(storeId, reqNum));
  } catch {
    /* ignore */
  }
};

export default function TefTestSaleCard({ storeId }: Props) {
  const effectiveStoreId = storeId || ASA_SUL_ID;
  const formStorageKey = `tef-paygo:sale-form:${effectiveStoreId}`;
  const uiStorageKey = `tef-paygo:sale-ui:${effectiveStoreId}`;
  const [amount, setAmount] = useState("");
  const [saleId, setSaleId] = useState(DEFAULT_SALE_ID);
  const [manualConfirmation, setManualConfirmation] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"AUTO" | "CREDITO" | "DEBITO" | "PIX">("AUTO");
  const [pixNetwork, setPixNetwork] = useState<string>("PIX C6 BANK");
  const [customerReceiptPref, setCustomerReceiptPref] = useState<"short" | "holder" | "full" | "none">("short");
  const [merchantReceiptPref, setMerchantReceiptPref] = useState<"merch" | "full" | "none">("merch");
  const [receiptVariants, setReceiptVariants] = useState<{
    customerShort?: string | null;
    customerHolder?: string | null;
    customerFull?: string | null;
    merchantMerch?: string | null;
    merchantFull?: string | null;
  }>({});
  const [confirmSaleModalOpen, setConfirmSaleModalOpen] = useState(false);
  const [pendingTxAmountCents, setPendingTxAmountCents] = useState(0);
  const [pendingTxSaleId, setPendingTxSaleId] = useState("");
  const [pendingTxRecNum, setPendingTxRecNum] = useState("");
  const [pendingTxAuth, setPendingTxAuth] = useState("");
  const [pendingTxAcquirer, setPendingTxAcquirer] = useState("");
  const [pendingTxMessage, setPendingTxMessage] = useState("");
  const [pendingModalKind, setPendingModalKind] = useState<PendingModalKind>("agent_recovery");
  const manualConfirmationRef = useRef(false);
  const resolvingPendenciaRef = useRef(false);
  const busyRef = useRef(false);
  const auditTxIdRef = useRef<string | null>(null);
  const agentPendingRef = useRef<AgentPendingConfirmation | null>(null);
  const [saleCaptureModalOpen, setSaleCaptureModalOpen] = useState(false);
  const [saleCaptures, setSaleCaptures] = useState<SaleCapture[] | null>(null);
  const [saleCaptureInputs, setSaleCaptureInputs] = useState<Record<number, string>>({});
  const [saleSubmittingCapture, setSaleSubmittingCapture] = useState(false);
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [activePaymentId, setActivePaymentId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TefStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [merchantReceiptText, setMerchantReceiptText] = useState<string>("");
  const [customerReceiptText, setCustomerReceiptText] = useState<string>("");
  const [pixQrBrCode, setPixQrBrCode] = useState<string>("");
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string>("");
  const [pixQrModalOpen, setPixQrModalOpen] = useState(false);
  const [pixWaitMsg, setPixWaitMsg] = useState<string>("");
  const [pixSaleInfo, setPixSaleInfo] = useState<string>("");
  const saleEventSourceRef = useRef<EventSource | null>(null);
  const lastCaptureSeqRef = useRef<string>("");
  const latestPixQrRef = useRef("");
  const pixQrTimeoutRef = useRef<number | null>(null);
  const formHydratedRef = useRef(false);
  const uiHydratedRef = useRef(false);
  const hasPixQr = !!pixQrDataUrl;
  const isPending = status === "pending_confirmation";
  const statusUi = STATUS_STYLE[status];
  const statusText = statusMsg || "Aguardando envio";

  useEffect(() => {
    manualConfirmationRef.current = manualConfirmation;
  }, [manualConfirmation]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    formHydratedRef.current = false;
    try {
      const isFirstLoadThisSession = !window.sessionStorage.getItem(TEF_PAYGO_SESSION_INIT_KEY);
      if (isFirstLoadThisSession) {
        setAmount("");
        setSaleId(DEFAULT_SALE_ID);
        setManualConfirmation(false);
        window.sessionStorage.setItem(TEF_PAYGO_SESSION_INIT_KEY, "1");
        formHydratedRef.current = true;
        return;
      }

      const raw = window.localStorage.getItem(formStorageKey);
      if (!raw) {
        setAmount("");
        setSaleId(DEFAULT_SALE_ID);
        setManualConfirmation(false);
        formHydratedRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as {
        amount?: string;
        saleId?: string;
        manualConfirmation?: boolean;
        paymentMethod?: "AUTO" | "CREDITO" | "DEBITO" | "PIX";
        pixNetwork?: string;
        customerReceiptPref?: "short" | "holder" | "full" | "none";
        merchantReceiptPref?: "merch" | "full" | "none";
      };
      setAmount(typeof parsed.amount === "string" ? parsed.amount : "");
      setSaleId(typeof parsed.saleId === "string" && parsed.saleId.trim() ? parsed.saleId : DEFAULT_SALE_ID);
      setManualConfirmation(!!parsed.manualConfirmation);
      if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
      if (typeof parsed.pixNetwork === "string") setPixNetwork(parsed.pixNetwork);
      if (parsed.customerReceiptPref) setCustomerReceiptPref(parsed.customerReceiptPref);
      if (parsed.merchantReceiptPref) setMerchantReceiptPref(parsed.merchantReceiptPref);
    } catch {
      setAmount("");
      setSaleId(DEFAULT_SALE_ID);
      setManualConfirmation(false);
    } finally {
      formHydratedRef.current = true;
    }
  }, [formStorageKey]);

  useEffect(() => {
    if (!formHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        formStorageKey,
        JSON.stringify({
          amount,
          saleId,
          manualConfirmation,
          paymentMethod,
          pixNetwork,
          customerReceiptPref,
          merchantReceiptPref,
        }),
      );
    } catch {
      // ignore localStorage write errors
    }
  }, [formStorageKey, amount, saleId, manualConfirmation, paymentMethod, pixNetwork, customerReceiptPref, merchantReceiptPref]);

  // Recalcula os textos exibidos de comprovante conforme preferência do usuário
  useEffect(() => {
    const v = receiptVariants;
    const hasAny = !!(v.customerShort || v.customerHolder || v.customerFull || v.merchantMerch || v.merchantFull);
    if (!hasAny) return;
    let cust = "";
    if (customerReceiptPref === "short") cust = v.customerShort || v.customerHolder || v.customerFull || "";
    else if (customerReceiptPref === "holder") cust = v.customerHolder || v.customerFull || v.customerShort || "";
    else if (customerReceiptPref === "full") cust = v.customerFull || v.customerHolder || v.customerShort || "";
    let merch = "";
    if (merchantReceiptPref === "merch") merch = v.merchantMerch || v.merchantFull || "";
    else if (merchantReceiptPref === "full") merch = v.merchantFull || v.merchantMerch || "";
    setCustomerReceiptText(cust);
    setMerchantReceiptText(merch);
  }, [receiptVariants, customerReceiptPref, merchantReceiptPref]);


  useEffect(() => {
    uiHydratedRef.current = false;
    try {
      const raw = window.localStorage.getItem(uiStorageKey);
      if (!raw) {
        setStatus("idle");
        setStatusMsg("");
        setMerchantReceiptText("");
        setCustomerReceiptText("");
        setPixQrBrCode("");
        setPixQrDataUrl("");
        setPixWaitMsg("");
        setPixSaleInfo("");
        setActivePaymentId("");
        uiHydratedRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as {
        status?: TefStatus;
        statusMsg?: string;
        merchantReceiptText?: string;
        customerReceiptText?: string;
        pixQrBrCode?: string;
        pixWaitMsg?: string;
        pixSaleInfo?: string;
        activePaymentId?: string;
      };
      const restoredStatus = parsed.status && Object.prototype.hasOwnProperty.call(STATUS_STYLE, parsed.status)
        ? parsed.status
        : "idle";
      const safeStatus = restoredStatus === "pending_confirmation" ? "idle" : restoredStatus;
      setStatus(safeStatus);
      setStatusMsg(typeof parsed.statusMsg === "string" ? parsed.statusMsg : "");
      setMerchantReceiptText(typeof parsed.merchantReceiptText === "string" ? parsed.merchantReceiptText : "");
      setCustomerReceiptText(typeof parsed.customerReceiptText === "string" ? parsed.customerReceiptText : "");
      setPixQrBrCode(typeof parsed.pixQrBrCode === "string" ? parsed.pixQrBrCode : "");
      setPixWaitMsg(typeof parsed.pixWaitMsg === "string" ? parsed.pixWaitMsg : "");
      setPixSaleInfo(typeof parsed.pixSaleInfo === "string" ? parsed.pixSaleInfo : "");
      setActivePaymentId(typeof parsed.activePaymentId === "string" ? parsed.activePaymentId : "");
    } catch {
      setStatus("idle");
      setStatusMsg("");
      setMerchantReceiptText("");
      setCustomerReceiptText("");
      setPixQrBrCode("");
      setPixQrDataUrl("");
      setPixWaitMsg("");
      setPixSaleInfo("");
      setActivePaymentId("");
    } finally {
      uiHydratedRef.current = true;
    }
  }, [uiStorageKey]);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    if (status === "pending_confirmation") return;
    try {
      window.localStorage.setItem(
        uiStorageKey,
        JSON.stringify({
          status,
          statusMsg,
          merchantReceiptText,
          customerReceiptText,
          pixQrBrCode,
          pixWaitMsg,
          pixSaleInfo,
          activePaymentId,
        }),
      );
    } catch {
      // ignore localStorage write errors
    }
  }, [uiStorageKey, status, statusMsg, merchantReceiptText, customerReceiptText, pixQrBrCode, pixWaitMsg, pixSaleInfo, activePaymentId]);

  // Renderiza QR sempre que receber novo BR Code
  useEffect(() => {
    latestPixQrRef.current = pixQrBrCode;
    if (!pixQrBrCode) { setPixQrDataUrl(""); return; }
    QRCode.toDataURL(pixQrBrCode, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then(setPixQrDataUrl)
      .catch(() => setPixQrDataUrl(""));
  }, [pixQrBrCode]);

  useEffect(() => () => {
    if (pixQrTimeoutRef.current != null) {
      window.clearTimeout(pixQrTimeoutRef.current);
      pixQrTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadTefConfig(effectiveStoreId)
      .then((cfg) => {
        if (!mounted) return;
        setAgentUrl(cfg.agentUrl);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [effectiveStoreId]);

  useEffect(() => {
    if (!agentUrl) return;
    const streamUrl = joinAgentUrl(agentUrl, "/api/events/stream");
    const es = new EventSource(streamUrl);
    saleEventSourceRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data || "{}") as any;
      const paymentId = String(data?.paymentId || "");
      if (!paymentId) return;

      // Durante a venda, fixa o paymentId ativo no primeiro evento recebido.
      if (busy && !activePaymentId) setActivePaymentId(paymentId);
      if (activePaymentId && paymentId !== activePaymentId) return;

      if (data?.message && data?.type !== "APPROVED" && data?.type !== "PENDING") setStatusMsg(String(data.message));

      const isPendingEvent =
        data?.type === "PENDING"
        || (data?.type === "INFO" && isPendingEventMessage(String(data?.message || "")));

      if (isPendingEvent && busyRef.current) {
        const openModal = manualConfirmationRef.current;
        void (async () => {
          const ingested = await waitAndIngestPendingConfirmation(paymentId, {
            fromAgentSync: true,
            forceAgentProbe: true,
            openModal,
            maxAttempts: 8,
          });
          if (ingested) {
            if (openModal) {
              setStatus("pending_confirmation");
              setConfirmSaleModalOpen(true);
            } else {
              setConfirmSaleModalOpen(false);
            }
          }
        })();
      }

      if (data?.type === "APPROVED" && busyRef.current && manualConfirmationRef.current) {
        void (async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
          const payment = await fetchPaymentById(agentUrl, paymentId);
          if (payment && isPaygoPendingApiStatus(payment.status)) {
            setStatus("pending_confirmation");
            setConfirmSaleModalOpen(true);
            await waitAndIngestPendingConfirmation(paymentId, {
              payment,
              fromAgentSync: true,
              forceAgentProbe: true,
              openModal: true,
              maxAttempts: 6,
            });
          }
        })();
      }

      if (data?.type === "CONFIRMED") {
        setStatus("approved");
        clearPendingUiState();
        const pendingSnapshot = agentPendingRef.current;
        agentPendingRef.current = null;
        void (async () => {
          const payment = await fetchPaymentById(agentUrl, paymentId);
          const result = await upsertSaleAudit(
            payment ?? {
              id: paymentId,
              saleId: saleId.trim() || DEFAULT_SALE_ID,
              amountInCents: Math.round(Number(amount.replace(",", ".")) * 100) || 0,
              status: "CONFIRMADA",
              message: String(data?.message || "Venda confirmada no PayGo"),
              paygo: pendingSnapshot
                ? {
                    reqNum: pendingSnapshot.reqNum,
                    locRef: pendingSnapshot.locRef,
                    extRef: pendingSnapshot.extRef,
                    virtMerch: pendingSnapshot.virtMerch,
                    authSyst: pendingSnapshot.authSyst,
                  }
                : null,
            } as ApiPayment,
            "approved",
          );
          if (result.id) {
            clearStoredAuditTxId(effectiveStoreId, pendingSnapshot?.reqNum);
            auditTxIdRef.current = null;
            notifyTefAuditUpdated();
          } else {
            reportAuditFailure(result, "confirmação");
          }
        })();
      }
      if (data?.type === "UNDONE") {
        setStatus("cancelled");
        clearPendingUiState();
        const pendingSnapshot = agentPendingRef.current;
        agentPendingRef.current = null;
        void (async () => {
          const payment = await fetchPaymentById(agentUrl, paymentId);
          const result = await upsertSaleAudit(
            payment ?? {
              id: paymentId,
              saleId: saleId.trim() || DEFAULT_SALE_ID,
              amountInCents: Math.round(Number(amount.replace(",", ".")) * 100) || 0,
              status: "DESFEITA",
              message: String(data?.message || "Venda desfeita no PayGo"),
              paygo: pendingSnapshot
                ? {
                    reqNum: pendingSnapshot.reqNum,
                    locRef: pendingSnapshot.locRef,
                    extRef: pendingSnapshot.extRef,
                    virtMerch: pendingSnapshot.virtMerch,
                    authSyst: pendingSnapshot.authSyst,
                  }
                : null,
            } as ApiPayment,
            "cancelled",
          );
          if (result.id) {
            clearStoredAuditTxId(effectiveStoreId, pendingSnapshot?.reqNum);
            auditTxIdRef.current = null;
            notifyTefAuditUpdated();
          } else {
            reportAuditFailure(result, "desfazimento");
          }
        })();
      }
      if (data?.type === "DENIED" || data?.type === "ERROR") setStatus("error");
      if (data?.type === "PINPAD") setStatus((prev) => (prev === "approved" ? prev : "processing"));
      if (data?.type === "QRCODE" && data?.message && data.message !== latestPixQrRef.current) {
        setPixQrBrCode(String(data.message));
        setPixQrModalOpen(true);
        setPixWaitMsg("Aguardando pagamento PIX...");
        if (pixQrTimeoutRef.current != null) {
          window.clearTimeout(pixQrTimeoutRef.current);
        }
        pixQrTimeoutRef.current = window.setTimeout(() => {
          setPixQrModalOpen(false);
          toast({
            title: "Modal Pix encerrado",
            description: "Sem retorno da PayGo em 90 segundos. Acompanhe o status da transação na tela.",
          });
        }, 90000);
      }

      if (data?.type === "APPROVED" || data?.type === "CONFIRMED" || data?.type === "DENIED" || data?.type === "ERROR") {
        if (pixQrTimeoutRef.current != null) {
          window.clearTimeout(pixQrTimeoutRef.current);
          pixQrTimeoutRef.current = null;
        }
        if (latestPixQrRef.current) {
          setPixQrModalOpen(false);
        }
      }

      const interaction = data?.interaction;
      if (interaction?.id) {
        if (lastCaptureSeqRef.current === interaction.id) return;
        lastCaptureSeqRef.current = interaction.id;
        const capture: SaleCapture = {
          interactionId: interaction.id,
          identificador: Number(interaction.identifier || 0),
          tipo: interaction.kind === "menu" ? 1 : 2,
          prompt: String(interaction.prompt || "Informe o valor solicitado"),
          options: Array.isArray(interaction.options) ? interaction.options : [],
          tamMin: Number(interaction.minLength || 0),
          tamMax: Number(interaction.maxLength || 0),
          ocultar: interaction.inputType === "password",
        };
        setSaleCaptures([capture]);
        setSaleCaptureInputs({});
        setSaleCaptureModalOpen(true);
      }
    };
    return () => {
      es.close();
      saleEventSourceRef.current = null;
    };
  }, [agentUrl, activePaymentId, busy]);

  const normalizeInteractionValue = (cap: SaleCapture, rawValue: string): string => {
    const value = String(rawValue ?? "").trim();
    const identifier = `0x${Number(cap.identificador || 0).toString(16).toUpperCase()}`;

    if (identifier === "0x25" || identifier === "0x60") {
      return normalizeCurrencyToCents(value);
    }

    if (identifier === "0x57") {
      return normalizeDateToPaygo(value);
    }

    if (identifier === "0x73") {
      return normalizeTimeToPaygo(value);
    }

    return value;
  };

  const normalizeCurrencyToCents = (input: string): string => {
    const text = String(input || "").trim();
    if (!text) return "";
    const compact = text.replace(/\s/g, "");
    if (/^\d+$/.test(compact)) return compact;
    const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
    const amount = Number(normalized);
    if (Number.isFinite(amount)) return String(Math.round(amount * 100));
    return text.replace(/\D/g, "");
  };

  const normalizeDateToPaygo = (input: string): string => {
    const value = String(input || "").trim();
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}${iso[2]}${iso[1].slice(-2)}`;
    const br = value.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (br) return `${br[1]}${br[2]}${br[3].slice(-2)}`;
    const digits = value.replace(/\D/g, "");
    if (digits.length === 8) return `${digits.slice(0, 2)}${digits.slice(2, 4)}${digits.slice(6, 8)}`;
    return digits;
  };

  const normalizeTimeToPaygo = (input: string): string => {
    const value = String(input || "").trim();
    const hhmmss = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmss) return `${hhmmss[1]}${hhmmss[2]}${hhmmss[3] || "00"}`;
    return value.replace(/\D/g, "");
  };

  const submitSaleCapture = async (responses: { identificador: number; value: string }[]) => {
    if (!responses.length) return;
    setSaleSubmittingCapture(true);
    try {
      if (!agentUrl) throw new Error("Agent URL não carregada");
      const cap = saleCaptures?.[0];
      const interactionId = cap?.interactionId;
      const r = await fetch(joinAgentUrl(agentUrl, "/api/interactions/respond"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: interactionId
          ? JSON.stringify({ interactionId, value: responses[0].value, identificador: responses[0].identificador })
          : JSON.stringify({ responses }),
      });
      const data = await r.json().catch(() => ({} as any));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setSaleCaptures(null);
      setSaleCaptureInputs({});
      setSaleCaptureModalOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaleSubmittingCapture(false);
    }
  };

  const upsertSaleAudit = async (payment: ApiPayment, uiStatus: TefStatus) => {
    const cfg = await loadTefConfig(effectiveStoreId);
    const reqnum = payment.paygo?.reqNum || payment.nsu || undefined;
    let value = payment.amountInCents ? payment.amountInCents / 100 : 0;
    if (!value && uiStatus === "pending_confirmation") {
      const fromPending = Number(agentPendingRef.current?.amountCentavos || 0) / 100;
      if (fromPending > 0) value = fromPending;
    }
    if (!value && uiStatus === "pending_confirmation" && reqnum) {
      const existing = await findPendingTefTransactionByReqnum(effectiveStoreId, reqnum);
      if (existing?.amount) value = existing.amount;
    }
    if (!value && uiStatus !== "pending_confirmation") {
      value = Number(amount.replace(",", ".")) || 0;
    }
    let existingId = auditTxIdRef.current;
    const reqForStorage = payment.paygo?.reqNum || payment.nsu || undefined;
    if (!existingId && reqForStorage) {
      existingId = loadStoredAuditTxId(effectiveStoreId, reqForStorage);
    }
    if (!existingId && reqnum) {
      const existing = await findTefTransactionByReqnum(effectiveStoreId, reqnum);
      existingId = existing?.id ?? null;
    }
    const raw = buildPaygoAuditRaw(payment as unknown as Record<string, unknown>);
    const baseSaleId = payment.saleId || saleId.trim() || DEFAULT_SALE_ID;
    const auditSaleId = buildTefAuditSaleId(baseSaleId, {
      paygoReqnum: reqnum,
      paymentId: payment.id,
    });
    const result = await upsertTefTransactionAudit({
      existingId: existingId ?? undefined,
      storeId: effectiveStoreId,
      provider: cfg.provider,
      amount: value,
      saleId: auditSaleId,
      status: uiStatus,
      message: payment.message,
      nsu: payment.nsu || undefined,
      authorizationCode: payment.authorizationCode || undefined,
      cardBrand: payment.brand || undefined,
      acquirer: payment.acquirer || undefined,
      paygoReqnum: payment.paygo?.reqNum || payment.nsu || undefined,
      raw,
    });
    if (result.id) {
      auditTxIdRef.current = result.id;
      storeAuditTxId(effectiveStoreId, reqForStorage || reqnum, result.id);
    }
    return result;
  };

  const notifyTefAuditUpdated = () => {
    window.dispatchEvent(new CustomEvent("tef-audit-updated"));
  };

  const clearPendingUiState = () => {
    agentPendingRef.current = null;
    setPendingTxAmountCents(0);
    setPendingTxSaleId("");
    setPendingTxRecNum("");
    setPendingTxAuth("");
    setPendingTxAcquirer("");
    setPendingTxMessage("");
    setConfirmSaleModalOpen(false);
  };

  const reportAuditFailure = (
    result: { id: string | null; error: string | null },
    context: string,
  ) => {
    if (result.id) return true;
    const hint = /pending_confirmation|check constraint|violates check/i.test(String(result.error || ""))
      ? " Execute no Supabase a migração 20260707120000_tef_pending_confirmation_status.sql."
      : /row-level security|permission denied|42501/i.test(String(result.error || ""))
        ? " Verifique login (employee) e aplique a migração 20260707180000_tef_transactions_staff_select.sql."
        : "";
    toast({
      title: `Auditoria não salva (${context})`,
      description: (result.error ?? "Falha ao gravar no Supabase.") + hint,
      variant: "destructive",
    });
    return false;
  };

  const fetchAgentPendingConfirmation = async (baseUrl: string): Promise<{
    pending: AgentPendingConfirmation | null;
    api: Record<string, unknown> | null;
  }> => {
    try {
      const resp = await fetch(joinAgentUrl(baseUrl, "/api/tef/pending"));
      if (!resp.ok) return { pending: null, api: null };
      const data = await resp.json().catch(() => ({} as any));
      const stored = data?.pending;
      const tuple = data?.tuple || stored;
      if (!tuple?.reqNum && !data?.reqNum) return { pending: null, api: data };

      const merged = {
        ...(stored || {}),
        reqNum: tuple?.reqNum || stored?.reqNum || data?.reqNum,
        locRef: tuple?.locRef || stored?.locRef || "",
        extRef: tuple?.extRef || stored?.extRef || "",
        virtMerch: tuple?.virtMerch || stored?.virtMerch || "",
        authSyst: tuple?.authSyst || stored?.authSyst || "",
        reason: stored?.reason || data?.reason || undefined,
        amountCentavos: Number(
          stored?.amountCentavos
          || data?.amountInCents
          || data?.probe?.amountInCents
          || 0,
        ) || undefined,
        saleId: stored?.saleId || data?.saleId || undefined,
      } as AgentPendingConfirmation;

      return merged.reqNum ? { pending: merged, api: data } : { pending: null, api: data };
    } catch {
      return { pending: null, api: null };
    }
  };

  const resolvePendingAmountCentavos = async (
    pending: AgentPendingConfirmation,
    api?: Record<string, unknown> | null,
  ): Promise<number> => {
    let cents = Number(pending.amountCentavos || api?.amountInCents || 0);
    if (cents > 0) return Math.round(cents);

    cents = parseAmountCentavosFromReceipt(
      api?.merchantReceipt as string | undefined,
      api?.customerReceipt as string | undefined,
      api?.probe && typeof api.probe === "object"
        ? (api.probe as Record<string, unknown>).merchantReceipt as string | undefined
        : undefined,
      api?.probe && typeof api.probe === "object"
        ? (api.probe as Record<string, unknown>).customerReceipt as string | undefined
        : undefined,
    ) || 0;
    if (cents > 0) return cents;

    if (pending.reqNum) {
      const tx = await findTefTransactionByReqnum(effectiveStoreId, pending.reqNum);
      if (tx?.amount && tx.amount > 0) return Math.round(tx.amount * 100);
      const raw = tx?.rawResponse;
      if (raw && typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        cents = parseAmountCentavosFromReceipt(
          String(record.merchantReceipt || ""),
          String(record.customerReceipt || ""),
        ) || 0;
        if (cents > 0) return cents;
      }
    }

    return 0;
  };

  const applyPendingContext = (
    pending: AgentPendingConfirmation,
    payment?: ApiPayment,
    opts?: { fromAgentSync?: boolean; api?: Record<string, unknown> | null },
  ) => {
    const cents = Number(
      payment?.amountInCents
      || pending.amountCentavos
      || opts?.api?.amountInCents
      || 0,
    );
    setPendingTxAmountCents(cents > 0 ? Math.round(cents) : 0);
    const resolvedSaleId = payment?.saleId || pending.saleId || saleId.trim() || DEFAULT_SALE_ID;
    setPendingTxSaleId(resolvedSaleId);
    setPendingTxRecNum(pending.reqNum || payment?.paygo?.reqNum || payment?.nsu || "");
    setPendingTxAuth(pending.extRef || payment?.authorizationCode || payment?.paygo?.extRef || "");
    setPendingTxAcquirer(pending.authSyst || payment?.acquirer || payment?.paygo?.authSyst || "");
    const friendlyMessage = formatPendingReason(pending.reason || payment?.message);
    setPendingTxMessage(friendlyMessage);
    setPendingModalKind(resolvePendingModalKind(pending.reason, opts?.fromAgentSync));
    setStatusMsg(friendlyMessage);
    agentPendingRef.current = {
      ...pending,
      amountCentavos: cents > 0 ? Math.round(cents) : pending.amountCentavos,
      saleId: payment?.saleId || pending.saleId,
    };
  };

  const persistPendingAudit = async (payment: ApiPayment) => {
    let cents = Number(payment.amountInCents || agentPendingRef.current?.amountCentavos || 0);
    if (!cents && agentPendingRef.current) {
      cents = await resolvePendingAmountCentavos(agentPendingRef.current, null);
    }
    if (!cents) {
      const formCents = Math.round(Number(amount.replace(",", ".")) * 100);
      if (formCents > 0) cents = formCents;
    }
    if (cents > 0) payment.amountInCents = cents;

    const result = await upsertSaleAudit(payment, "pending_confirmation");
    if (!result.id) {
      reportAuditFailure(result, "pendência PayGo");
      return null;
    }
    notifyTefAuditUpdated();
    return result.id;
  };

  /** Persiste PENDENTE_CONFIRMACAO no Supabase assim que a PayGo informa pendência. */
  const ingestPendingConfirmation = async (
    paymentId: string,
    opts?: {
      payment?: ApiPayment | null;
      fromAgentSync?: boolean;
      openModal?: boolean;
      skipPendingProbe?: boolean;
      forceAgentProbe?: boolean;
    },
  ): Promise<boolean> => {
    const forceProbe = !!opts?.forceAgentProbe || !!opts?.fromAgentSync;
    const hasKnownTuple = !!(opts?.payment?.paygo?.reqNum || opts?.payment?.nsu);
    if (
      busyRef.current
      && !forceProbe
      && !hasKnownTuple
    ) {
      return false;
    }

    const shouldProbeAgent = forceProbe || (!opts?.skipPendingProbe && !hasKnownTuple);
    const [{ pending: agentPending, api }, payment] = await Promise.all([
      shouldProbeAgent
        ? fetchAgentPendingConfirmation(agentUrl)
        : Promise.resolve({ pending: null as AgentPendingConfirmation | null, api: null as Record<string, unknown> | null }),
      opts?.payment !== undefined
        ? Promise.resolve(opts.payment)
        : fetchPaymentById(agentUrl, paymentId),
    ]);

    const pendingSource: AgentPendingConfirmation = agentPending || {
      reqNum: payment?.paygo?.reqNum || payment?.nsu || "",
      locRef: payment?.paygo?.locRef || "",
      extRef: payment?.paygo?.extRef || payment?.authorizationCode || "",
      virtMerch: payment?.paygo?.virtMerch || "",
      authSyst: payment?.paygo?.authSyst || payment?.acquirer || "",
      reason: "falha-comunicacao-pendente",
      amountCentavos: payment?.amountInCents || undefined,
      saleId: payment?.saleId,
    };

    if (!pendingSource.reqNum) return false;

    const storedAuditId = loadStoredAuditTxId(effectiveStoreId, pendingSource.reqNum);
    if (storedAuditId) auditTxIdRef.current = storedAuditId;

    const payStatus = String(payment?.status || "").toUpperCase();
    const hasAgentPending = !!agentPending?.reqNum;
    const hasPaymentPending = !!payment && isPaygoPendingApiStatus(payStatus);
    const hasPaymentTuple = !!(payment?.paygo?.reqNum || payment?.nsu);
    if (!hasAgentPending && !hasPaymentPending && !hasPaymentTuple && !opts?.fromAgentSync && !forceProbe) {
      return false;
    }

    const mergedPayment: ApiPayment = payment?.paygo?.reqNum && isPaygoPendingApiStatus(payment.status)
      ? { ...payment, status: "PENDENTE_CONFIRMACAO" }
      : {
          id: paymentId,
          saleId: pendingSource.saleId || payment?.saleId || saleId.trim() || DEFAULT_SALE_ID,
          amountInCents: payment?.amountInCents || pendingSource.amountCentavos || Math.round(Number(amount.replace(",", ".")) * 100) || 0,
          status: "PENDENTE_CONFIRMACAO",
          message: formatPendingReason(pendingSource.reason) || payment?.message || "Pendência PayGo",
          nsu: pendingSource.reqNum,
          authorizationCode: pendingSource.extRef || payment?.authorizationCode || null,
          acquirer: pendingSource.authSyst || payment?.acquirer || null,
          paygo: {
            reqNum: pendingSource.reqNum,
            locRef: pendingSource.locRef,
            extRef: pendingSource.extRef,
            virtMerch: pendingSource.virtMerch,
            authSyst: pendingSource.authSyst,
          },
        };

    if (mergedPayment.id) setActivePaymentId(mergedPayment.id);
    const cents = await resolvePendingAmountCentavos(pendingSource, api);
    if (cents > 0) mergedPayment.amountInCents = cents;
    applyPendingContext(pendingSource, mergedPayment, {
      fromAgentSync: !!opts?.fromAgentSync,
      api,
    });
    const auditId = await persistPendingAudit(mergedPayment);
    if (auditId && opts?.openModal) {
      setStatus("pending_confirmation");
      setConfirmSaleModalOpen(true);
    }
    return !!auditId;
  };

  /** Aguarda PayGo/agente expor pendência e persiste (retry contra race após APPROVED). */
  const waitAndIngestPendingConfirmation = async (
    paymentId: string,
    opts?: {
      payment?: ApiPayment | null;
      fromAgentSync?: boolean;
      openModal?: boolean;
      maxAttempts?: number;
      forceAgentProbe?: boolean;
    },
  ): Promise<boolean> => {
    const attempts = opts?.maxAttempts ?? 6;
    for (let i = 0; i < attempts; i++) {
      const ingested = await ingestPendingConfirmation(paymentId, {
        ...opts,
        fromAgentSync: opts?.fromAgentSync ?? true,
        forceAgentProbe: opts?.forceAgentProbe ?? true,
        openModal: opts?.openModal ?? false,
      });
      if (ingested) return true;
      if (i < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }
    return false;
  };

  /** Verifica pendência no agente, persiste no Supabase e bloqueia nova venda se houver. */
  const handleAgentPendingBeforeSale = async (baseUrl: string): Promise<boolean> => {
    const { pending, api } = await fetchAgentPendingConfirmation(baseUrl);
    if (!pending?.reqNum) {
      agentPendingRef.current = null;
      setPendingTxAmountCents(0);
      setPendingTxSaleId("");
      setPendingTxRecNum("");
      setPendingTxAuth("");
      setPendingTxAcquirer("");
      setPendingTxMessage("");
      return false;
    }

    const amountCentavos = await resolvePendingAmountCentavos(pending, api);
    const enriched = {
      ...pending,
      amountCentavos: amountCentavos || pending.amountCentavos,
    };
    const payment = buildPaymentFromAgentPending({
      ...enriched,
      amountCentavos: amountCentavos || enriched.amountCentavos,
    });
    applyPendingContext(enriched, payment, { fromAgentSync: true, api });
    setActivePaymentId("");

    const storedAuditId = loadStoredAuditTxId(effectiveStoreId, pending.reqNum);
    if (storedAuditId) auditTxIdRef.current = storedAuditId;

    const ingested = await waitAndIngestPendingConfirmation(`sync-${pending.reqNum}`, {
      payment,
      fromAgentSync: true,
      forceAgentProbe: true,
      openModal: false,
      maxAttempts: 6,
    });

    if (ingested) {
      setStatus("pending_confirmation");
      setStatusMsg(formatPendingReason(pending.reason) || "Pendência PayGo aguardando confirmação");
      setConfirmSaleModalOpen(true);
      toast({
        title: "Pendência PayGo ativa",
        description: "Confirme ou desfaça a transação pendente antes de iniciar uma nova venda.",
      });
      return true;
    }

    toast({
      title: "Pendência detectada",
      description: "Há uma transação pendente no PayGo, mas não foi possível registrá-la no Supabase.",
      variant: "destructive",
    });
    setStatus("pending_confirmation");
    setConfirmSaleModalOpen(true);
    return true;
  };

  const fetchPaymentById = async (baseUrl: string, paymentId: string): Promise<ApiPayment | null> => {
    try {
      const resp = await fetch(joinAgentUrl(baseUrl, `/api/payments/${paymentId}`));
      if (!resp.ok) return null;
      return (await resp.json()) as ApiPayment;
    } catch {
      return null;
    }
  };

  const upsertSaleAuditError = async (message: string, partial?: Partial<ApiPayment>) => {
    const value = partial?.amountInCents
      ? partial.amountInCents / 100
      : Number(amount.replace(",", ".")) || 0;
    const payment = {
      id: partial?.id || activePaymentId,
      saleId: partial?.saleId || saleId.trim() || DEFAULT_SALE_ID,
      amountInCents: Math.round(value * 100),
      status: partial?.status || "ERRO_COMUNICACAO",
      message,
      ...partial,
    } as ApiPayment;
    await upsertSaleAudit(payment, "error");
  };

  const runSale = async () => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor invalido", variant: "destructive" });
      return;
    }

    setBusy(true);
    setStatus("connecting");
    setStatusMsg("Verificando pendências PayGo...");
    setConfirmSaleModalOpen(false);

    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      setAgentUrl(cfg.agentUrl);
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

      const blockedByPending = await handleAgentPendingBeforeSale(cfg.agentUrl);
      if (blockedByPending) {
        setBusy(false);
        return;
      }

      setStatus("connecting");
      setStatusMsg("Enviando para o PayGo TEF...");
      setMerchantReceiptText("");
      setCustomerReceiptText("");
      setPixQrBrCode("");
      setPixQrModalOpen(false);
      setPixWaitMsg("");
      setPixSaleInfo("");
      setSaleCaptures(null);
      setSaleCaptureInputs({});
      setSaleCaptureModalOpen(false);
      setActivePaymentId("");
      auditTxIdRef.current = null;
      lastCaptureSeqRef.current = "";

      const resolvedMenuChoice = paymentMethod === "PIX" ? (pixNetwork || "PIX C6 BANK") : "";
      const resp = await fetch(joinAgentUrl(cfg.agentUrl, "/api/payments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: saleId.trim() || DEFAULT_SALE_ID,
          amountInCents: Math.round(value * 100),
          manualConfirmation,
          method: paymentMethod === "AUTO" ? undefined : paymentMethod,
          paygoMenuChoice: resolvedMenuChoice || undefined,
        }),
      });
      const payment = (await resp.json().catch(() => ({}))) as ApiPayment;
      const isBlockedPending = resp.status === 409 && payment?.status === "PENDENTE_CONFIRMACAO";
      const isTruePending = isBlockedPending || payment.status === "PENDENTE_CONFIRMACAO";
      const needsManualConfirm =
        manualConfirmation
        && (payment.status === "APROVADA_NAO_CONFIRMADA" || payment.status === "PENDENTE_CONFIRMACAO");
      const shouldOpenPendingModal = isBlockedPending || needsManualConfirm;

      if (isTruePending || needsManualConfirm) {
        const pid = payment?.id || activePaymentId;
        if (pid) {
          const ingested = await waitAndIngestPendingConfirmation(pid, {
            payment: {
              ...payment,
              status: "PENDENTE_CONFIRMACAO",
              amountInCents: payment.amountInCents || Math.round(value * 100),
              saleId: payment.saleId || saleId.trim() || DEFAULT_SALE_ID,
            },
            fromAgentSync: true,
            forceAgentProbe: true,
            openModal: shouldOpenPendingModal,
            maxAttempts: 8,
          });
          if (ingested) {
            if (shouldOpenPendingModal) {
              setStatus("pending_confirmation");
              setConfirmSaleModalOpen(true);
            } else {
              setConfirmSaleModalOpen(false);
            }
          } else if (isTruePending && shouldOpenPendingModal) {
            const fallback = await upsertSaleAudit(
              {
                ...payment,
                status: "PENDENTE_CONFIRMACAO",
                amountInCents: payment.amountInCents || Math.round(value * 100),
                saleId: payment.saleId || saleId.trim() || DEFAULT_SALE_ID,
              },
              "pending_confirmation",
            );
            if (fallback.id) {
              if (shouldOpenPendingModal) setStatus("pending_confirmation");
              notifyTefAuditUpdated();
            } else {
              reportAuditFailure(fallback, "pendência PayGo");
            }
          }
        } else if (shouldOpenPendingModal) {
          setStatus("pending_confirmation");
          setConfirmSaleModalOpen(true);
        }
      }
      if (!resp.ok && !isBlockedPending) {
        throw new Error((payment as any)?.error || payment?.message || `HTTP ${resp.status}`);
      }
      if (payment?.id) setActivePaymentId(payment.id);
      setReceiptVariants({
        customerShort: payment.customerReceiptShort ?? null,
        customerHolder: payment.customerReceiptHolder ?? null,
        customerFull: payment.customerReceiptFull ?? null,
        merchantMerch: payment.merchantReceiptMerch ?? null,
        merchantFull: payment.merchantReceiptFull ?? null,
      });
      setMerchantReceiptText(payment.merchantReceipt || "");
      setCustomerReceiptText(payment.customerReceipt || "");

      const nextStatus = mapApiStatusToUi(payment.status);
      setStatus(nextStatus);
      if (payment.status === "CONFIRMADA") {
        clearPendingUiState();
        setStatusMsg(`Confirmada - NSU ${payment.nsu ?? "-"} - Aut. ${payment.authorizationCode ?? "-"}`);
      } else {
        setConfirmSaleModalOpen(false);
      }
      const nsu = payment.nsu ?? "-";
      const auth = payment.authorizationCode ?? "-";
      if (payment.status === "CONFIRMADA") {
        // statusMsg já definido acima
      } else if (!isTruePending && !needsManualConfirm) {
        if (payment.status === "NEGADA" || payment.status === "ERRO_COMUNICACAO" || payment.status === "TIMEOUT") {
          setStatusMsg(`${payment.status}: ${payment.message || "Transação não aprovada"}`);
        } else {
          setStatusMsg(payment.message || "Processando transação...");
        }
      }

      if (payment.merchantReceipt || payment.customerReceipt) {
        pushTefReceipt({
          label: `${payment.brand || "TEF"} · ${(saleId.trim() || DEFAULT_SALE_ID)} · R$ ${value.toFixed(2)}`,
          merchant: payment.merchantReceipt || undefined,
          customer: payment.customerReceipt || undefined,
        });
      }

      if (!isTruePending && !needsManualConfirm) {
        const result = await upsertSaleAudit(payment, nextStatus);
        if (result.id) notifyTefAuditUpdated();
        else reportAuditFailure(result, "venda");
      }

      toast({
        title: isBlockedPending
          ? "Pendência PayGo ativa"
          : payment.status === "CONFIRMADA"
            ? "Aprovado"
            : needsManualConfirm
              ? "Aguardando confirmação"
              : `Resultado: ${payment.status}`,
        description: payment.message ?? payment.authorizationCode ?? payment.nsu ?? "",
        variant: isBlockedPending || needsManualConfirm ? "default" : payment.status === "CONFIRMADA" ? "default" : "destructive",
      });
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message ?? String(err));
      await upsertSaleAuditError(err?.message ?? String(err), {
        id: activePaymentId || undefined,
        saleId: saleId.trim() || DEFAULT_SALE_ID,
        amountInCents: Math.round(value * 100),
      });
      toast({
        title: "Erro na transacao",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const cancelNetworkSelection = async () => {
    setPixQrBrCode("");
    setPixQrModalOpen(false);
    setPixWaitMsg("");
    setSaleCaptureModalOpen(false);
    setSaleCaptures(null);
    setSaleCaptureInputs({});
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      const adapter = createTefAdapter(cfg);
      await adapter.cancel();
    } catch {
      /* ignore */
    }
    setStatus("cancelled");
    setStatusMsg("Operacao PayGo cancelada pelo operador");
    if (pixQrTimeoutRef.current != null) {
      window.clearTimeout(pixQrTimeoutRef.current);
      pixQrTimeoutRef.current = null;
    }
  };

  const paymentExistsInAgent = async (baseUrl: string, paymentId: string): Promise<boolean> => {
    if (!paymentId) return false;
    try {
      const resp = await fetch(joinAgentUrl(baseUrl, `/api/payments/${paymentId}`));
      return resp.ok;
    } catch {
      return false;
    }
  };

  const resolvePendingViaTef = async (
    action: "confirm" | "undo",
    pending: AgentPendingConfirmation,
    baseUrl: string,
  ): Promise<{ ok: boolean; data: ApiPayment; body: Record<string, unknown> }> => {
    const resp = await fetch(joinAgentUrl(baseUrl, `/tef/${action}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reqNum: pending.reqNum,
        locRef: pending.locRef,
        extRef: pending.extRef,
        virtMerch: pending.virtMerch,
        authSyst: pending.authSyst,
      }),
    });
    const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const resolvedStatus = action === "confirm" ? "CONFIRMADA" : "DESFEITA";
    const data = buildPaymentFromAgentPending(pending);
    data.status = resolvedStatus;
    data.message = String(body?.message || (body?.retorno as Record<string, unknown>)?.message || data.message || "");
    return { ok: resp.ok && !!body?.ok, data, body };
  };

  const resolverPendencia = async (action: "confirm" | "undo") => {
    const cfg = await loadTefConfig(effectiveStoreId);
    const fetched = await fetchAgentPendingConfirmation(cfg.agentUrl);
    const pending = agentPendingRef.current ?? fetched.pending;
    if (!activePaymentId && !pending?.reqNum) {
      toast({ title: "Sem transação ativa", description: "Nenhum pagamento pendente para confirmar/desfazer.", variant: "destructive" });
      return;
    }
    resolvingPendenciaRef.current = true;
    setConfirmSaleModalOpen(false);
    setBusy(true);
    setStatus("processing");
    const isPending = pendingModalKind === "agent_recovery" || !!pending?.reqNum
      || statusMsg.toLowerCase().includes("pendência") || statusMsg.toLowerCase().includes("pendencia");
    setStatusMsg(
      action === "confirm"
        ? (isPending ? "Confirmando pendência no PayGo..." : "Confirmando venda no PayGo...")
        : (isPending ? "Desfazendo pendência no PayGo..." : "Desfazendo venda no PayGo..."),
    );
    try {
      let data: ApiPayment | null = null;
      let respOk = false;

      const paymentInAgent = activePaymentId
        ? await paymentExistsInAgent(cfg.agentUrl, activePaymentId)
        : false;
      const preferTefApi = isPending && pending?.reqNum && (!activePaymentId || !paymentInAgent || pendingModalKind === "agent_recovery");

      if (!preferTefApi && activePaymentId && paymentInAgent) {
        const resp = await fetch(joinAgentUrl(cfg.agentUrl, `/api/payments/${activePaymentId}/${action}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        data = (await resp.json().catch(() => ({}))) as ApiPayment;
        respOk = resp.ok;
        if (!respOk && resp.status === 404 && pending?.reqNum) {
          const tefResult = await resolvePendingViaTef(action, pending, cfg.agentUrl);
          data = tefResult.data;
          respOk = tefResult.ok;
        }
      } else if (pending?.reqNum) {
        const tefResult = await resolvePendingViaTef(action, pending, cfg.agentUrl);
        data = tefResult.data;
        respOk = tefResult.ok;
      }

      if (respOk && data) {
        setMerchantReceiptText(data?.merchantReceipt || merchantReceiptText);
        setCustomerReceiptText(data?.customerReceipt || customerReceiptText);
        const uiStatus = mapApiStatusToUi(data?.status);
        setStatus(uiStatus);
        setStatusMsg(
          data?.message
            ?? (action === "confirm"
              ? (isPending ? "Pendência confirmada no PayGo" : "Venda confirmada no PayGo")
              : (isPending ? "Pendência desfeita no PayGo" : "Venda desfeita no PayGo")),
        );
        const auditResult = await upsertSaleAudit(data, uiStatus);
        if (auditResult.id) notifyTefAuditUpdated();
        else reportAuditFailure(auditResult, action === "confirm" ? "confirmação" : "desfazimento");
        const resolvedReqNum = data?.paygo?.reqNum || data?.nsu || pending?.reqNum;
        clearStoredAuditTxId(effectiveStoreId, resolvedReqNum);
        auditTxIdRef.current = null;
        clearPendingUiState();
        setActivePaymentId("");
        // Re-sincroniza com o agente: se o host PayGo confirma que não há mais
        // pendência real (PWINFO_PNDREQNUM vazio), o /api/tef/pending já limpa
        // o arquivo local via getPendingDetails (stale-file protection), então
        // a próxima runSale não fica bloqueada por resíduo local.
        try { await fetchAgentPendingConfirmation(cfg.agentUrl); } catch { /* ignore */ }
        toast({
          title: action === "confirm" ? "Venda efetivada" : "Desfazimento manual",
          description: data?.message ?? (action === "confirm"
            ? (isPending ? "Pendência confirmada no PayGo" : "Venda confirmada no PayGo")
            : (isPending ? "Pendência desfeita no PayGo" : "Venda desfeita no PayGo")),
        });
      } else {
        const errMsg = (data as any)?.error ?? `Falha ao ${action === "confirm" ? "confirmar" : "desfazer"} pendência`;
        setStatus("error");
        setStatusMsg(errMsg);
        await upsertSaleAuditError(errMsg, {
          id: activePaymentId || undefined,
          saleId: saleId.trim() || DEFAULT_SALE_ID,
          status: data?.status || "ERRO_COMUNICACAO",
          nsu: data?.nsu ?? pending?.reqNum,
          authorizationCode: data?.authorizationCode ?? pending?.extRef,
          brand: data?.brand ?? undefined,
          acquirer: data?.acquirer ?? pending?.authSyst,
          paygo: data?.paygo ?? (pending
            ? {
                reqNum: pending.reqNum,
                locRef: pending.locRef,
                extRef: pending.extRef,
                virtMerch: pending.virtMerch,
                authSyst: pending.authSyst,
              }
            : undefined),
        } as ApiPayment);
        toast({
          title: "Falha",
          description: errMsg,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message ?? String(err));
      await upsertSaleAuditError(err?.message ?? String(err), {
        id: activePaymentId || undefined,
        saleId: saleId.trim() || DEFAULT_SALE_ID,
        paygo: pending
          ? {
              reqNum: pending.reqNum,
              locRef: pending.locRef,
              extRef: pending.extRef,
              virtMerch: pending.virtMerch,
              authSyst: pending.authSyst,
            }
          : undefined,
      } as ApiPayment);
      toast({ title: "Erro", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      resolvingPendenciaRef.current = false;
      setBusy(false);
    }
  };

  const handleConfirmModalOpenChange = (open: boolean) => {
    if (open) {
      setConfirmSaleModalOpen(true);
      return;
    }
    if (resolvingPendenciaRef.current || busy) {
      setConfirmSaleModalOpen(false);
      return;
    }
    if (isPending && (activePaymentId || agentPendingRef.current)) {
      void resolverPendencia("undo");
      return;
    }
    setConfirmSaleModalOpen(false);
  };

  const resetForNewSale = () => {
    try {
      window.localStorage.removeItem(formStorageKey);
      window.localStorage.removeItem(uiStorageKey);
    } catch {
      // ignore localStorage errors
    }
    setAmount("");
    setSaleId(DEFAULT_SALE_ID);
    setStatus("idle");
    setStatusMsg("");
    setMerchantReceiptText("");
    setCustomerReceiptText("");
    setPixQrBrCode("");
    setPixQrDataUrl("");
    setPixQrModalOpen(false);
    setPixWaitMsg("");
    setPixSaleInfo("");
    setSaleCaptureModalOpen(false);
    setSaleCaptures(null);
    setSaleCaptureInputs({});
    setSaleSubmittingCapture(false);
    setActivePaymentId("");
    auditTxIdRef.current = null;
    clearPendingUiState();
    lastCaptureSeqRef.current = "";
    if (pixQrTimeoutRef.current != null) {
      window.clearTimeout(pixQrTimeoutRef.current);
      pixQrTimeoutRef.current = null;
    }
    toast({ title: "Nova venda", description: "Campos da tela limpos para iniciar uma nova transação." });
  };

  return (
    <Card className="space-y-4 border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">PayGo TEF</p>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="h-5 w-5 text-warning" />
            Interface de venda
          </h2>
          <p className="text-sm text-muted-foreground">
            Fluxo rápido para validar débito, crédito e Pix no mesmo padrão da demo de referência.
          </p>
        </div>
        <Badge variant="outline" className="h-fit">ASA SUL</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Valor (R$)</label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 text-base font-medium"
                disabled={busy}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">ID da venda</label>
              <Input
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                className="h-11"
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <Checkbox
              id="manual-confirmation"
              checked={manualConfirmation}
              onCheckedChange={(checked) => setManualConfirmation(checked === true)}
              disabled={busy}
            />
            <div className="space-y-1">
              <Label htmlFor="manual-confirmation" className="text-sm font-medium leading-none">
                Confirmação manual de venda
              </Label>
              <p className="text-xs text-muted-foreground">
                Quando marcado, a venda aprovada aguarda sua decisão (confirmação ou desfazimento manual).
                Desmarcado: confirma automaticamente no PayGo após aprovação no pinpad.
              </p>
            </div>
          </div>
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Comprovante do cliente</Label>
              <Select
                value={customerReceiptPref}
                onValueChange={(v) => setCustomerReceiptPref(v as "short" | "holder" | "full" | "none")}
                disabled={busy}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Reduzido (via curta)</SelectItem>
                  <SelectItem value="holder">Portador (via cliente)</SelectItem>
                  <SelectItem value="full">Completo (via integral)</SelectItem>
                  <SelectItem value="none">Não emitir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Comprovante do estabelecimento</Label>
              <Select
                value={merchantReceiptPref}
                onValueChange={(v) => setMerchantReceiptPref(v as "merch" | "full" | "none")}
                disabled={busy}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merch">Estabelecimento (padrão)</SelectItem>
                  <SelectItem value="full">Completo (via integral)</SelectItem>
                  <SelectItem value="none">Não emitir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="md:col-span-2 text-[11px] text-muted-foreground">
              Escolhe qual via da PayGo é exibida/impressa. Se a rede não devolver a via preferida, cai automaticamente para a próxima disponível.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Fluxo de venda</Badge>
              <span className="text-xs text-muted-foreground">igual à demo PayGo</span>
            </div>
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Forma de pagamento</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as "AUTO" | "CREDITO" | "DEBITO" | "PIX")}
                  disabled={busy}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Automático (escolher no pinpad)</SelectItem>
                    <SelectItem value="CREDITO">Crédito</SelectItem>
                    <SelectItem value="DEBITO">Débito</SelectItem>
                    <SelectItem value="PIX">Pix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === "PIX" && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Rede Pix</Label>
                  <Select value={pixNetwork} onValueChange={setPixNetwork} disabled={busy}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PIX C6 BANK">PIX C6 BANK</SelectItem>
                      <SelectItem value="PIX CIELO">PIX CIELO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              A verificação de pendência PayGo ocorre somente ao clicar em &quot;Efetuar Pagamento&quot;.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={resetForNewSale} disabled={busy} variant="outline" className="h-11 w-full gap-2 text-sm">
                <RotateCcw className="h-4 w-4" />
                Nova Venda
              </Button>
              <Button onClick={() => void runSale()} disabled={busy} className="h-11 w-full gap-2 text-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Efetuar Pagamento
              </Button>
            </div>
          </div>

          {(merchantReceiptText || customerReceiptText) && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <div className="text-muted-foreground">Comprovante do estabelecimento</div>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-background p-2 font-mono whitespace-pre-wrap">
                  {merchantReceiptText || "Sem comprovante disponível para esta transação."}
                </pre>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <div className="text-muted-foreground">Comprovante do cliente</div>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-background p-2 font-mono whitespace-pre-wrap">
                  {customerReceiptText || "Sem comprovante disponível para esta transação."}
                </pre>
              </div>
            </div>
          )}

        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Status da transacao</h3>
          <div className={`rounded-lg border p-4 ${statusUi.panelClass}`}>
            <div className="flex items-center gap-2">
              <Badge variant={statusUi.kind === "success" ? "default" : "outline"}>{statusUi.kind}</Badge>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            <p className="mt-2 text-sm leading-relaxed">
              {statusText}
            </p>
          </div>

          {hasPixQr && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
                <QrCode className="h-4 w-4" />
                QR Pix gerado para o checkout
              </div>
              {pixSaleInfo && (
                <Badge variant="outline" className="mb-2">{pixSaleInfo}</Badge>
              )}
              <img src={pixQrDataUrl} alt="QR Code Pix" className="mx-auto rounded border bg-white p-2" width={220} height={220} />
            </div>
          )}

        </div>
      </div>

      <Dialog open={pixQrModalOpen && !!pixQrDataUrl} onOpenChange={(open) => { if (!open) { void cancelNetworkSelection(); setPixQrBrCode(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Pague com Pix</DialogTitle>
            <DialogDescription>
              {pixWaitMsg || "Cliente, escaneie este QR Code no app do seu banco para concluir o pagamento."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="w-full rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              <strong>Ambiente DEMO Setis:</strong> este QR não é Pix real. Não tente pagar pelo app do banco — a aprovação é simulada pelo próprio PayGo após alguns segundos.
            </div>
            {pixSaleInfo && <Badge variant="outline">{pixSaleInfo}</Badge>}
            {pixQrDataUrl && (
              <img src={pixQrDataUrl} alt="QR Code Pix" className="rounded border bg-white p-2" width={320} height={320} />
            )}
            <details className="w-full text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Mostrar BR Code (Pix copia-e-cola)</summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 font-mono break-all whitespace-pre-wrap">{pixQrBrCode}</pre>
            </details>
            <Button variant="destructive" className="w-full" onClick={() => void cancelNetworkSelection()}>
              {status === "timeout" ? "Cancelar após conferência" : "Cancelar transação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saleCaptureModalOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parâmetro solicitado pela PayGo</DialogTitle>
            <DialogDescription>
              {saleCaptures?.[0]?.prompt || "Aguardando entrada do operador..."}
            </DialogDescription>
          </DialogHeader>
          {saleCaptures?.[0] && (
            <div className="space-y-3">
              {(() => {
                const cap = saleCaptures[0];
                const options = (cap.options && cap.options.length > 0 ? cap.options : []) || [];
                return options.length > 0 ? (
                <div className="grid gap-2">
                  {options.map((opt) => (
                    <Button
                      key={`${cap.identificador}-${opt.value}`}
                      variant="outline"
                      className="justify-start"
                      disabled={saleSubmittingCapture}
                      onClick={() => void submitSaleCapture([{ identificador: cap.identificador, value: opt.value }])}
                    >
                      {opt.label || opt.value}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    autoFocus
                    type={cap.ocultar ? "password" : "text"}
                    placeholder={cap.mascara || ""}
                    value={saleCaptureInputs[cap.identificador] ?? ""}
                    onChange={(e) => setSaleCaptureInputs((prev) => ({ ...prev, [cap.identificador]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const raw = saleCaptureInputs[cap.identificador] ?? "";
                        const value = normalizeInteractionValue(cap, raw);
                        void submitSaleCapture([{ identificador: cap.identificador, value }]);
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      const raw = saleCaptureInputs[cap.identificador] ?? "";
                      const value = normalizeInteractionValue(cap, raw);
                      void submitSaleCapture([{ identificador: cap.identificador, value }]);
                    }}
                    disabled={saleSubmittingCapture}
                    className="w-full"
                  >
                    {saleSubmittingCapture ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
                  </Button>
                </div>
              );
              })()}
              <Button variant="ghost" disabled={saleSubmittingCapture} onClick={() => void cancelNetworkSelection()} className="w-full">
                Cancelar operação
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSaleModalOpen && isPending} onOpenChange={handleConfirmModalOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              {pendingModalKind === "agent_recovery" ? "Pendência PayGo" : "Confirmar venda"}
            </DialogTitle>
            <DialogDescription>
              {pendingModalKind === "agent_recovery"
                ? "Transação autorizada no pinpad ficou pendente no PayGo. Confirme para efetivar ou desfaça para liberar novas vendas."
                : "Venda aprovada no PayGo. Confirme para efetivar ou desfaça a transação antes da finalização."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Venda</span>
              <span className="font-medium">{pendingTxSaleId || "Não informado"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-medium">{formatPendingAmountLabel(pendingTxAmountCents)}</span>
            </div>
            {pendingTxRecNum && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">RecNum</span>
                <span className="font-mono font-medium">{pendingTxRecNum}</span>
              </div>
            )}
            {pendingTxAuth && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Autorização</span>
                <span className="font-mono font-medium">{pendingTxAuth}</span>
              </div>
            )}
            {pendingTxAcquirer && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Adquirente</span>
                <span className="font-medium">{pendingTxAcquirer}</span>
              </div>
            )}
            {pendingTxMessage && (
              <p className="pt-1 text-xs text-muted-foreground">{pendingTxMessage}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void resolverPendencia("undo")}
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {pendingModalKind === "agent_recovery" ? "Desfazer pendência" : "Desfazer venda"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void resolverPendencia("confirm")}
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {pendingModalKind === "agent_recovery" ? "Confirmar pendência" : "Confirmar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
