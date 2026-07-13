/**
 * Painel de administração do pinpad:
 * - botão "Administrativo"
 * - captura interativa (menu/typed/userauth) via modal
 */
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Settings2, Usb, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig } from "@/lib/tef";
import {
  paygoAdministrativo,
  paygoAdmStatus,
  paygoAdmRespond,
  paygoAdmAbort,
  type PaygoAdmCapture,
  type PaygoAdmStatus,
} from "@/lib/tef/paygoAdapter";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

interface Props {
  storeId?: string | null;
}

const PAYGO_PARAM_NAME_BY_ID: Record<number, string> = {
  0x05: "Host de autenticação",
  0x07: "Porta de autenticação",
  0x11: "Ponto de captura (PdC)",
  0x15: "Nome da automação",
  0x16: "Versão da automação",
  0x17: "Dispositivo da automação",
  0x1B: "Endereço do ambiente",
  0x1C: "CNPJ/CPF do estabelecimento",
  0x24: "Capacidade da automação",
  0x25: "Valor total",
  0x26: "Moeda",
  0x27: "Casas decimais",
  0x28: "Referência fiscal",
  0x29: "Tipo do cartão",
  0x35: "Sistema autorizador/rede",
  0x36: "Código do estabelecimento (EC)",
  0x3B: "Modalidade de financiamento",
  0x3C: "Número de parcelas",
  0x42: "Mensagem de resultado",
  0x43: "Requer confirmação",
  0x44: "Referência local",
  0x45: "Referência externa",
  0x46: "Código de autorização",
  0x4B: "Nome da bandeira",
  0x52: "Comprovante completo",
  0x53: "Comprovante estabelecimento",
  0x54: "Comprovante cliente",
  0x57: "Data original da transação",
  0x60: "Valor original da transação",
  0x73: "Hora original da transação",
  0x78: "Referência local original",
  0xF5: "Senha de gerenciamento",
  0xF6: "Senha técnica",
  0x1F21: "Tipo de pagamento",
  0x1F77: "Payload do QR Code",
  0x7F01: "Uso de pinpad",
  0x7F02: "Porta do pinpad",
  0x7F05: "Sistema autorizador pendente",
  0x7F06: "EC pendente",
  0x7F07: "Número da requisição pendente",
  0x7F08: "Referência local pendente",
  0x7F09: "Referência externa pendente",
  0x7F50: "Preferência de exibição do QR",
};

const captureTypeLabel = (captureType?: string, tipo?: number): string => {
  if (captureType === "MENU" || tipo === 1) return "Menu de opções";
  if (captureType === "TYPED" || tipo === 2) return "Entrada digitada";
  if (captureType === "USERAUTH" || tipo === 17) return "Autenticação";
  return "Captura de dados";
};

const parameterLabel = (capture?: PaygoAdmCapture | null): string => {
  if (!capture) return "Operação administrativa";
  const named = PAYGO_PARAM_NAME_BY_ID[capture.identificador];
  return named || `Parâmetro ${capture.identificador}`;
};

const parameterCodeHex = (capture?: PaygoAdmCapture | null): string => {
  if (!capture) return "";
  return `0x${capture.identificador.toString(16).toUpperCase()}`;
};

const normalizeCurrencyToCents = (input: string): string => {
  const text = String(input || "").trim();
  if (!text) return "";
  const compact = text.replace(/\s/g, "");
  // PayGo usa centavos inteiros (209 = R$ 2,09). Digitos sem separador = centavos.
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

const normalizeCaptureValue = (capture: PaygoAdmCapture, rawValue: string): string => {
  const identifier = parameterCodeHex(capture);
  const value = String(rawValue ?? "").trim();
  if (identifier === "0x25" || identifier === "0x60") return normalizeCurrencyToCents(value);
  if (identifier === "0x57") return normalizeDateToPaygo(value);
  if (identifier === "0x73") return normalizeTimeToPaygo(value);
  return value;
};

const captureInputHint = (capture?: PaygoAdmCapture | null): string => {
  const id = capture ? parameterCodeHex(capture) : "";
  if (id === "0x25" || id === "0x60") return "Ex.: 2,09 (reais) — não use 209,00";
  if (id === "0x57") return "Ex.: 03/07/26";
  if (id === "0x78") return "Ref. local da venda original (campo REF do comprovante)";
  if (id === "0x73") return "Ex.: 17:34:30";
  return capture?.mascara || "";
};

const defaultCaptureInputs = (pending: PaygoAdmCapture[]): Record<number, string> => {
  const next: Record<number, string> = {};
  for (const cap of pending) {
    const initial = String(cap.valorInicial ?? "").trim();
    if (initial) next[cap.identificador] = initial;
  }
  return next;
};

const isStartedResponse = (resp: { started?: unknown } | PaygoAgentResponse): boolean =>
  typeof (resp as any).started === "boolean" && (resp as any).started;

const readString = (obj: Record<string, unknown>, key: string): string => {
  const value = obj[key];
  return typeof value === "string" ? value : "";
};

const formatReceiptBlock = (title: string, content: string): string => {
  if (!content.trim()) return "";
  return `${title}\n${content.trim()}`;
};

const toResultText = (status: PaygoAdmStatus): string => {
  if (status.receipts && typeof status.receipts === "object") {
    const receipts = status.receipts as Record<string, unknown>;
    const merchantReceipt = readString(receipts, "merchantReceipt");
    const customerReceipt = readString(receipts, "customerReceipt");
    const fullReceipt = readString(receipts, "fullReceipt");
    const acquirer = readString(receipts, "acquirer");
    const brand = readString(receipts, "brand");
    const authCode = readString(receipts, "authCode");
    const reqNum = readString(receipts, "reqNum");
    const resultMessage = status.message || readString(receipts, "resultMessage") || "Operação concluída";
    const blocks = [
      `Retorno PayGo: ${resultMessage}`,
      acquirer ? `Rede: ${acquirer}` : "",
      brand ? `Bandeira: ${brand}` : "",
      authCode ? `Autorização: ${authCode}` : "",
      reqNum ? `NSU/Requisição: ${reqNum}` : "",
      formatReceiptBlock("Comprovante estabelecimento:", merchantReceipt || fullReceipt),
      formatReceiptBlock("Comprovante cliente:", customerReceipt || fullReceipt),
    ].filter(Boolean);
    if (blocks.length > 0) return blocks.join("\n\n");
    return JSON.stringify(receipts, null, 2);
  }
  return JSON.stringify(status, null, 2);
};

export default function TefPinpadSetupCard({ storeId }: Props) {
  const effectiveStoreId = storeId || ASA_SUL_ID;
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState("");
  const [result, setResult] = useState("");
  const [adminStatus, setAdminStatus] = useState<"idle" | "running" | "waiting_input" | "done" | "error" | "aborted">("idle");
  const [adminStatusMessage, setAdminStatusMessage] = useState("Aguardando operacao");
  const [adminSessionActive, setAdminSessionActive] = useState(false);
  const [captures, setCaptures] = useState<PaygoAdmCapture[] | null>(null);
  const [captureInputs, setCaptureInputs] = useState<Record<number, string>>({});
  const [submittingCapture, setSubmittingCapture] = useState(false);
  const pollRef = useRef<number | null>(null);
  const lastCaptureSeqRef = useRef<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadTefConfig(effectiveStoreId);
        setAgentUrl(cfg.agentUrl);

        const st = await paygoAdmStatus(cfg.agentUrl);
        if (st.status === "waiting_input" || st.status === "running") {
          setBusy(true);
          setAdminSessionActive(true);
          setAdminStatus(st.status);
          setAdminStatusMessage(st.message || "Sessão administrativa em andamento");
          if (st.pendingCaptures && st.pendingCaptures.length > 0) {
            setCaptures(st.pendingCaptures);
            lastCaptureSeqRef.current = st.captureSeq ?? 0;
          } else {
            setCaptures(null);
          }
          setCaptureInputs({});
          if (st.message) setLastMsg(st.message);
          startPolling(cfg.agentUrl);
        }
      } catch {
        setAgentUrl("");
      }
    })();
  }, [effectiveStoreId]);

  useEffect(() => () => {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
  }, []);

  const stopPolling = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (url: string) => {
    stopPolling();
    lastCaptureSeqRef.current = 0;
    pollRef.current = window.setInterval(async () => {
      const st = await paygoAdmStatus(url);
      if (st.message) setLastMsg(st.message);

      if (st.status === "waiting_input" && st.pendingCaptures && st.pendingCaptures.length > 0) {
        setAdminStatus("waiting_input");
        setAdminStatusMessage(st.message || "Aguardando entrada do operador...");
        const seq = st.captureSeq ?? 0;
        if (seq !== lastCaptureSeqRef.current) {
          lastCaptureSeqRef.current = seq;
          setCaptures(st.pendingCaptures);
          setCaptureInputs(defaultCaptureInputs(st.pendingCaptures));
        }
        return;
      }

      if (st.status === "done" || st.status === "error" || st.status === "aborted" || st.status === "idle") {
        stopPolling();
        setBusy(false);
        setCaptures(null);
        setResult(toResultText(st));
        setAdminSessionActive(false);
        setAdminStatus(st.status);

        if (st.status === "error") {
          const msg = st.error || st.message || "Operação administrativa falhou";
          setLastMsg(msg);
          setAdminStatusMessage(msg);
          toast({ title: "Erro", description: msg, variant: "destructive" });
          return;
        }

        if (st.status === "aborted") {
          const msg = st.message || "Operação administrativa cancelada";
          setLastMsg(msg);
          setAdminStatusMessage(msg);
          toast({ title: "Cancelada", description: msg });
          return;
        }

        const msg = st.message || "Operação administrativa concluída";
        setLastMsg(msg);
        setAdminStatusMessage(msg);
        if (st.status === "done") toast({ title: "OK", description: msg });
      }
    }, 700);
  };

  const runAdministrativo = async () => {
    if (busy) return;
    if (!agentUrl) {
      toast({ title: "Agente indisponível", description: "Não foi possível identificar a URL do agente.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setAdminSessionActive(true);
    setAdminStatus("running");
    setAdminStatusMessage("Abrindo operacao administrativa...");
    setCaptures(null);
    setCaptureInputs({});
    setResult("");
    setLastMsg("Abrindo operacao administrativa...");

    const resp = await paygoAdministrativo(agentUrl, {});

    if (!resp.ok && !isStartedResponse(resp)) {
      setBusy(false);
      setAdminSessionActive(false);
      setAdminStatus("error");
      const err = resp.error || "Falha na operação administrativa";
      setLastMsg(err);
      setAdminStatusMessage(err);
      toast({ title: "Erro", description: err, variant: "destructive" });
      return;
    }

    const msg = resp.message || "Menu aberto no pinpad. Aguardando interação...";
    setLastMsg(msg);
    setAdminStatusMessage(msg);
    startPolling(agentUrl);
  };

  const submitMenuOption = async (cap: PaygoAdmCapture, value: string) => {
    if (!agentUrl) return;
    setSubmittingCapture(true);
    try {
      const resp = await paygoAdmRespond(agentUrl, [{ identificador: cap.identificador, value }]);
      if (!resp.ok) {
        toast({ title: "Erro", description: resp.error || "Falha ao enviar resposta", variant: "destructive" });
      } else {
        setCaptures(null);
        setCaptureInputs({});
      }
    } finally {
      setSubmittingCapture(false);
    }
  };

  const submitTypedAll = async () => {
    if (!agentUrl || !captures) return;
    setSubmittingCapture(true);
    try {
      const payload = captures.map((cap) => ({
        identificador: cap.identificador,
        value: normalizeCaptureValue(cap, captureInputs[cap.identificador] ?? ""),
      }));
      const resp = await paygoAdmRespond(agentUrl, payload);
      if (!resp.ok) {
        toast({ title: "Erro", description: resp.error || "Falha ao enviar resposta", variant: "destructive" });
      } else {
        setCaptures(null);
        setCaptureInputs({});
      }
    } finally {
      setSubmittingCapture(false);
    }
  };

  const cancelCapture = async () => {
    if (!agentUrl) return;
    await paygoAdmAbort(agentUrl);
    stopPolling();
    setBusy(false);
    setAdminSessionActive(false);
    setAdminStatus("aborted");
    setCaptures(null);
    setCaptureInputs({});
    setLastMsg("Operação abortada");
    setAdminStatusMessage("Operação abortada");
  };

  const currentCapture = captures?.[0] ?? null;
  const isMenu = !!currentCapture && currentCapture.tipo === 1 && !!currentCapture.options?.length;
  const isTyped = !!currentCapture && !isMenu;
  const isSecret = !!currentCapture && (currentCapture.ocultar || currentCapture.tipo === 17);
  const requestedParamLabel = parameterLabel(currentCapture);
  const requestedParamHex = parameterCodeHex(currentCapture);
  const requestedCaptureType = captureTypeLabel(currentCapture?.captureType, currentCapture?.tipo);

  return (
    <>
      <Card className="space-y-3 border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <Usb className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Configuração do PinPad</h2>
        </div>

        <Button onClick={() => void runAdministrativo()} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
          Administrativo
        </Button>

        <div className="space-y-2 rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status da configuração</div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
              adminStatus === "done"
                ? "bg-emerald-100 text-emerald-900"
                : adminStatus === "error"
                  ? "bg-rose-100 text-rose-900"
                  : adminStatus === "aborted"
                    ? "bg-orange-100 text-orange-900"
                    : adminStatus === "waiting_input" || adminStatus === "running"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-muted text-muted-foreground"
            }`}>
              {adminStatus}
            </span>
            <span className="text-sm">{adminStatusMessage}</span>
          </div>
          {result && (
            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs font-mono">{result}</pre>
          )}
        </div>
      </Card>

      <Dialog open={adminSessionActive} onOpenChange={() => {}}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              {currentCapture ? (isMenu ? "Selecione uma opção" : "Entrada solicitada pelo PayGo") : "Operação administrativa em andamento"}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">
              {currentCapture
                ? (currentCapture.prompt || (isMenu ? "Escolha uma opção do menu administrativo." : "Digite o valor solicitado."))
                : (lastMsg || "Aguardando próxima etapa do menu administrativo...")}
            </DialogDescription>
          </DialogHeader>

          {currentCapture && (
            <div className="grid gap-2 rounded border bg-muted/30 p-3 text-xs">
              <div><span className="text-muted-foreground">Parâmetro:</span> {requestedParamLabel}</div>
              <div><span className="text-muted-foreground">Identificador:</span> {requestedParamHex}</div>
              <div><span className="text-muted-foreground">Tipo:</span> {requestedCaptureType}</div>
            </div>
          )}

          {currentCapture && isMenu && (
            <div className="space-y-2">
              {currentCapture.options?.map((opt) => (
                <Button
                  key={`${currentCapture.identificador}-${opt.value}`}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={submittingCapture}
                  onClick={() => void submitMenuOption(currentCapture, opt.value)}
                >
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{opt.value}</span>
                  {opt.label}
                </Button>
              ))}
            </div>
          )}

          {currentCapture && isTyped && (
            <div className="space-y-2">
              <Input
                autoFocus
                type={isSecret ? "password" : "text"}
                maxLength={currentCapture.tamMax || undefined}
                placeholder={captureInputHint(currentCapture)}
                value={captureInputs[currentCapture.identificador] ?? ""}
                onChange={(e) => setCaptureInputs((prev) => ({ ...prev, [currentCapture.identificador]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") void submitTypedAll(); }}
              />
              {(parameterCodeHex(currentCapture) === "0x25" || parameterCodeHex(currentCapture) === "0x60") && (
                <p className="text-xs text-amber-700">
                  Informe o valor em reais com vírgula (ex.: <strong>2,09</strong> para R$ 2,09). Não digite 209,00.
                </p>
              )}
              {(currentCapture.tamMin || currentCapture.tamMax) && (
                <p className="text-xs text-muted-foreground">
                  Tamanho: {currentCapture.tamMin ?? 0} - {currentCapture.tamMax ?? "?"} caracteres
                </p>
              )}
            </div>
          )}

          {!currentCapture && (
            <div className="flex items-center gap-2 rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando próxima solicitação da PayGo...
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => void cancelCapture()} disabled={submittingCapture} className="gap-1">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            {currentCapture && isTyped && (
              <Button onClick={() => void submitTypedAll()} disabled={submittingCapture}>
                {submittingCapture ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
