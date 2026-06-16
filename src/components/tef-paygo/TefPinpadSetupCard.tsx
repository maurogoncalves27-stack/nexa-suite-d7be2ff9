/**
 * Card "Configurar pinpad" — dispara a operação ADM da PGWebLib via
 * NEXA Agent para parear/testar a porta do pinpad.
 *
 * "Abrir menu ADM" e "Testar comunicação" usam o mesmo endpoint
 * /tef/admin (PWOPER.ADMIN = 0x20). A diferença prática é a opção
 * que o operador escolhe no menu mostrado no próprio pinpad
 * (Instalação do Pinpad x Teste de Comunicação).
 */
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Usb, Loader2, Wifi, Settings2, ExternalLink, Activity, Power, Plug, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig } from "@/lib/tef";
import {
  paygoAdministrativo,
  checkPaygoAgent,
  paygoInstalarPdc,
  paygoTestarPinpad,
  paygoAdmStatus,
  paygoAdmRespond,
  paygoAdmAbort,
  type PaygoAdmCapture,
} from "@/lib/tef/paygoAdapter";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

interface Props {
  storeId?: string | null;
  cpfCnpj?: string | null;
  pontoDeCaptura?: string | null;
  sandboxHost?: string | null;
}

type PaygoMenuOption = {
  label: string;
  value: string;
};

type PaygoMenuPrompt = {
  mode: "install" | "adm" | "test";
  agentUrl: string;
  title: string;
  message: string;
  options: PaygoMenuOption[];
  payload: Record<string, any>;
};

export default function TefPinpadSetupCard({ storeId, cpfCnpj, pontoDeCaptura, sandboxHost }: Props) {
  const effectiveStoreId = storeId || ASA_SUL_ID;
  const [busy, setBusy] = useState<"adm" | "test" | "diag" | "init" | "port" | null>(null);
  const [lastMsg, setLastMsg] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [fetchFailed, setFetchFailed] = useState(false);
  const [captures, setCaptures] = useState<PaygoAdmCapture[] | null>(null);
  const [captureInputs, setCaptureInputs] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [menuPrompt, setMenuPrompt] = useState<PaygoMenuPrompt | null>(null);
  const [menuSubmitting, setMenuSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const lastCaptureSeqRef = useRef<number>(0);
  const lastAdminPayloadRef = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadTefConfig(effectiveStoreId);
        setAgentUrl(cfg.agentUrl);
      } catch {
        setAgentUrl("");
      }
    })();
  }, [effectiveStoreId]);

  const stopPolling = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const startPolling = (url: string) => {
    stopPolling();
    lastCaptureSeqRef.current = 0;
    pollRef.current = window.setInterval(async () => {
      const st = await paygoAdmStatus(url);
      if (st.message) setLastMsg(st.message);
      if (st.status === "waiting_input" && st.pendingCaptures && st.pendingCaptures.length > 0) {
        const seq = st.captureSeq ?? 0;
        if (seq !== lastCaptureSeqRef.current) {
          lastCaptureSeqRef.current = seq;
          setCaptures(st.pendingCaptures);
          setCaptureInputs({});
        }
      } else if (st.status === "done" || st.status === "error" || st.status === "aborted" || st.status === "idle") {
        stopPolling();
        setCaptures(null);
        if (st.status === "error" && st.error) {
          if (st.receipts) setResult(JSON.stringify(st.receipts, null, 2));
          if (openPaygoMenuPrompt("adm", url, lastAdminPayloadRef.current ?? {}, st.error)) return;
          setLastMsg(st.error);
          toast({ title: "Erro", description: st.error, variant: "destructive" });
        } else if (st.status === "done") {
          const r = ((st as any).result ?? st.receipts ?? {}) as Record<string, any>;
          const message = r.message ?? st.message ?? "Operação concluída";
          setResult(JSON.stringify(r, null, 2));
          setLastMsg(message);
          toast({ title: "OK", description: message });
        }
      }
    }, 700);
  };

  const submitMenuOption = async (cap: PaygoAdmCapture, value: string) => {
    if (!agentUrl) return;
    setSubmitting(true);
    try {
      const resp = await paygoAdmRespond(agentUrl, [{ identificador: cap.identificador, value }]);
      if (!resp.ok) {
        toast({ title: "Erro", description: resp.error ?? "Falha ao enviar resposta", variant: "destructive" });
      } else {
        setCaptures(null);
        setCaptureInputs({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitTypedAll = async () => {
    if (!agentUrl || !captures) return;
    setSubmitting(true);
    try {
      const payload = captures.map((c) => ({
        identificador: c.identificador,
        value: captureInputs[c.identificador] ?? "",
      }));
      const resp = await paygoAdmRespond(agentUrl, payload);
      if (!resp.ok) {
        toast({ title: "Erro", description: resp.error ?? "Falha ao enviar resposta", variant: "destructive" });
      } else {
        setCaptures(null);
        setCaptureInputs({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelCapture = async () => {
    if (!agentUrl) return;
    await paygoAdmAbort(agentUrl);
    setCaptures(null);
    setCaptureInputs({});
    stopPolling();
    setLastMsg("Operação abortada");
  };

  const isFetchFail = (msg: string) =>
    /failed to fetch|network|load failed|offline/i.test(msg);

  const parsePaygoMenuOptionsSafe = (message?: string): PaygoMenuOption[] => {
    if (!message) return [];
    const normalized = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Ã§/g, "c")
      .replace(/Ãµ/g, "o")
      .replace(/ÃƒÂµ/g, "o")
      .replace(/Ã£/g, "a");
    const marker = normalized.match(/opcoes?\s*:/i);
    if (!marker || marker.index == null) return [];
    return message
      .slice(marker.index + marker[0].length)
      .split(",")
      .map((raw) => {
        const text = raw.trim();
        const eq = text.indexOf("=");
        const label = eq >= 0 ? text.slice(0, eq).trim() : text;
        const value = eq >= 0 ? text.slice(eq + 1).trim() : text;
        return { label: label || value, value };
      })
      .filter((opt) => opt.value.length > 0);
  };

  const parsePaygoMenuOptions = (message?: string): PaygoMenuOption[] => {
    if (!message) return [];
    const marker = message.match(/op[cç](?:o|õ|Ãµ)es?\s*:/i);
    if (!marker || marker.index == null) return [];
    return message
      .slice(marker.index + marker[0].length)
      .split(",")
      .map((raw) => {
        const text = raw.trim();
        const eq = text.indexOf("=");
        const label = eq >= 0 ? text.slice(0, eq).trim() : text;
        const value = eq >= 0 ? text.slice(eq + 1).trim() : text;
        return { label: label || value, value };
      })
      .filter((opt) => opt.value.length > 0);
  };

  const openPaygoMenuPrompt = (
    mode: PaygoMenuPrompt["mode"],
    url: string,
    payload: Record<string, any>,
    message: string,
  ) => {
    const options = parsePaygoMenuOptionsSafe(message);
    if (options.length === 0) return false;
    setMenuPrompt({
      mode,
      agentUrl: url,
      payload,
      options,
      message,
      title: mode === "install" ? "Instalação PayGo" : "Menu administrativo PayGo",
    });
    setLastMsg("PayGo solicitou uma opção. Selecione no modal para continuar.");
    return true;
  };

  useEffect(() => {
    if (!lastMsg || menuPrompt || parsePaygoMenuOptionsSafe(lastMsg).length === 0) return;
    openPaygoMenuPrompt("adm", agentUrl, lastAdminPayloadRef.current ?? {}, lastMsg);
  }, [agentUrl, lastMsg, menuPrompt]);

  const diagnosticar = async () => {
    setBusy("diag");
    setLastMsg("Pingando /health do agente...");
    setResult("");
    setFetchFailed(false);
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      const h = await checkPaygoAgent(cfg.agentUrl);
      if (h.ok) {
        setLastMsg(`Agente OK — ${h.mode ?? ""} ${h.version ?? ""}`.trim());
      } else {
        setLastMsg(`Agente respondeu, mas: ${h.error ?? "desconhecido"}`);
        if (h.error && isFetchFail(h.error)) setFetchFailed(true);
      }
      setResult(JSON.stringify(h, null, 2));
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setLastMsg(msg);
      if (isFetchFail(msg)) setFetchFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const inicializar = async () => {
    setBusy("init");
    setLastMsg("Executando instalacao do PdC e iniciacao do pinpad PayGo...");
    setResult("");
    setFetchFailed(false);
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      if (cfg.provider !== "paygo") {
        toast({
          title: "Loja nao esta com PayGo",
          description: `Provider atual: ${cfg.provider}.`,
          variant: "destructive",
        });
        setBusy(null);
        return;
      }
      const payload = {
        cpfCnpj: cpfCnpj || cfg.merchantCode,
        pontoDeCaptura: pontoDeCaptura || cfg.terminalCode,
        ambiente: sandboxHost || "pos-transac-sb.tpgweb.io:31735",
        senhaTecnica: "",
        pinpadPort: "05",
        usePinpad: true,
      };
      const resp = await paygoInstalarPdc(cfg.agentUrl, payload);
      if (!resp.ok) {
        const err = resp.error ?? resp.message ?? "Falha ao instalar/inicializar o pinpad";
        if (isFetchFail(err)) setFetchFailed(true);
        if (openPaygoMenuPrompt("install", cfg.agentUrl, payload, err)) return;
        setLastMsg(err);
        toast({ title: "Erro", description: err, variant: "destructive" });
      } else {
        const r = (resp as any).retorno ?? resp;
        const v = r.message ?? resp.message ?? "PdC/pinpad PayGo inicializado";
        setLastMsg(v);
        setResult(JSON.stringify(resp.retorno ?? {}, null, 2));
        toast({ title: "TEF pronto", description: v });
        // re-pinga health pra refletir tefReady:true
        try {
          const h = await checkPaygoAgent(cfg.agentUrl);
          setResult((prev) => `${prev}\n\n--- /health ---\n${JSON.stringify(h, null, 2)}`);
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setLastMsg(msg);
      if (isFetchFail(msg)) setFetchFailed(true);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const testarPortaPinpad = async () => {
    setBusy("port");
    setLastMsg("Tentando abrir a porta COM do pinpad direto (sem PGWebLib)...");
    setResult("");
    setFetchFailed(false);
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      const portNum = Number((cfg as any).pinpadPort ?? (cfg as any).pinpad_port ?? 5) || 5;
      const resp = await paygoTestarPinpad(cfg.agentUrl, portNum);
      setLastMsg(resp.message ?? (resp.ok ? "Pinpad acessível" : "Falha"));
      setResult(JSON.stringify(resp, null, 2));
      toast({
        title: resp.ok ? `Pinpad OK (${resp.port})` : `Falha em ${resp.port ?? "COM?"}`,
        description: resp.message ?? "",
        variant: resp.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setLastMsg(msg);
      if (isFetchFail(msg)) setFetchFailed(true);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const run = async (mode: "adm" | "test") => {
    setBusy(mode);
    setLastMsg(mode === "adm" ? "Abrindo menu administrativo no pinpad..." : "Enviando teste de comunicação...");
    setResult("");
    setFetchFailed(false);
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      if (cfg.provider !== "paygo") {
        toast({
          title: "Loja não está com PayGo",
          description: `Provider atual: ${cfg.provider}.`,
          variant: "destructive",
        });
        setBusy(null);
        return;
      }
      const payload = {
        technicalPassword: "314159",
        pinpadPort: Number((cfg as any).pinpadPort ?? (cfg as any).pinpad_port ?? 5) || 5,
        merchantCode: cfg.merchantCode,
        terminalCode: cfg.terminalCode,
        host: cfg.environment === "demo" ? "pos-transac-sb.tpgweb.io:31735" : undefined,
      };
      lastAdminPayloadRef.current = payload;
      const resp = await paygoAdministrativo(cfg.agentUrl, payload);
      if (!resp.ok && !(resp as any).started) {
        const err = resp.error ?? "Falha na operação ADM";
        setLastMsg(err);
        if (isFetchFail(err)) setFetchFailed(true);
        if (openPaygoMenuPrompt(mode, cfg.agentUrl, payload, err)) return;
        toast({ title: "Erro", description: err, variant: "destructive" });
      } else {
        const msg = (resp as any).message ?? "Menu aberto no pinpad. Aguardando interação...";
        setLastMsg(msg);
        startPolling(cfg.agentUrl);
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setLastMsg(msg);
      if (isFetchFail(msg)) setFetchFailed(true);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const isInstallOption = (option: PaygoMenuOption) =>
    option.value === "1" || option.label.trim().toUpperCase() === "INSTALACAO";

  const runInstallFromMenu = async (prompt: PaygoMenuPrompt, option: PaygoMenuOption) => {
    const cfg = await loadTefConfig(effectiveStoreId);
    const payload = {
      cpfCnpj: cpfCnpj || cfg.merchantCode,
      pontoDeCaptura: pontoDeCaptura || cfg.terminalCode,
      ambiente: sandboxHost || "pos-transac-sb.tpgweb.io:31735",
      senhaTecnica: "",
      pinpadPort: "05",
      usePinpad: true,
      paygoMenuChoice: option.value,
    };
    setLastMsg("Executando instalacao do pinpad PayGo...");
    const resp = await paygoInstalarPdc(prompt.agentUrl || cfg.agentUrl, payload);
    if (!resp.ok) {
      const err = resp.error ?? resp.message ?? "Falha ao instalar/inicializar o pinpad";
      if (isFetchFail(err)) setFetchFailed(true);
      if (openPaygoMenuPrompt("install", prompt.agentUrl || cfg.agentUrl, payload, err)) return;
      setLastMsg(err);
      toast({ title: "Erro", description: err, variant: "destructive" });
      return;
    }

    const r = (resp as any).retorno ?? resp;
    const msg = r.message ?? resp.message ?? "PdC/pinpad PayGo inicializado";
    setMenuPrompt(null);
    setLastMsg(msg);
    setResult(JSON.stringify(resp.retorno ?? {}, null, 2));
    toast({ title: "TEF pronto", description: msg });
    try {
      const h = await checkPaygoAgent(prompt.agentUrl || cfg.agentUrl);
      setResult((prev) => `${prev}\n\n--- /health ---\n${JSON.stringify(h, null, 2)}`);
    } catch { /* ignore */ }
  };

  const submitPaygoMenuChoice = async (option: PaygoMenuOption) => {
    const prompt = menuPrompt;
    if (!prompt) return;
    const choice = option.value;
    setMenuSubmitting(true);
    setResult("");
    setFetchFailed(false);

    try {
      if (prompt.mode !== "install" && isInstallOption(option)) {
        await runInstallFromMenu(prompt, option);
        return;
      }

      if (prompt.mode === "install") {
        setLastMsg(`Executando opcao PayGo: ${choice}`);
        const payload = { ...prompt.payload, paygoMenuChoice: choice };
        const resp = await paygoInstalarPdc(prompt.agentUrl, payload);
        if (!resp.ok) {
          const err = resp.error ?? resp.message ?? "Falha ao instalar/inicializar o pinpad";
          setLastMsg(err);
          if (isFetchFail(err)) setFetchFailed(true);
          if (openPaygoMenuPrompt("install", prompt.agentUrl, payload, err)) return;
          toast({ title: "Erro", description: err, variant: "destructive" });
          return;
        }

        const r = (resp as any).retorno ?? resp;
        const msg = r.message ?? resp.message ?? "PdC/pinpad PayGo inicializado";
        setMenuPrompt(null);
        setLastMsg(msg);
        setResult(JSON.stringify(resp.retorno ?? {}, null, 2));
        toast({ title: "TEF pronto", description: msg });
        try {
          const h = await checkPaygoAgent(prompt.agentUrl);
          setResult((prev) => `${prev}\n\n--- /health ---\n${JSON.stringify(h, null, 2)}`);
        } catch { /* ignore */ }
        return;
      }

      setLastMsg(`Executando opcao administrativa PayGo: ${choice}`);
      const payload = { ...prompt.payload, paygoMenuChoice: choice };
      lastAdminPayloadRef.current = payload;
      const resp = await paygoAdministrativo(prompt.agentUrl, payload);
      if (!resp.ok && !(resp as any).started) {
        const err = resp.error ?? "Falha na operacao ADM";
        setLastMsg(err);
        if (isFetchFail(err)) setFetchFailed(true);
        if (openPaygoMenuPrompt(prompt.mode, prompt.agentUrl, payload, err)) return;
        toast({ title: "Erro", description: err, variant: "destructive" });
        return;
      }

      setMenuPrompt(null);
      const msg = (resp as any).message ?? "Menu aberto no pinpad. Aguardando interacao...";
      setLastMsg(msg);
      startPolling(prompt.agentUrl);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setLastMsg(msg);
      if (isFetchFail(msg)) setFetchFailed(true);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setMenuSubmitting(false);
    }
  };

  return (
    <>
    <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <Usb className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Configurar pinpad</h2>
      </div>

      <p className="text-xs text-muted-foreground">
        A instalação do PdC é feita uma única vez pelo instalador do PayGo Windows (modo DEMO). Aqui você apenas abre o menu administrativo do pinpad — as opções de menu e a senha técnica são solicitadas em tela e respondidas pelo operador.
      </p>

      <Button onClick={() => run("adm")} disabled={!!busy} className="gap-2">
        {busy === "adm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
        Abrir menu ADM
      </Button>

      {lastMsg && (
        <div className="rounded-md border bg-background p-2.5 text-sm">
          <span className="text-muted-foreground">Status:</span> {lastMsg}
        </div>
      )}
    </Card>


    <Dialog open={!!menuPrompt} onOpenChange={(o) => { if (!o && !menuSubmitting) setMenuPrompt(null); }}>
      <DialogContent className="max-w-md">
        {menuPrompt && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                {menuPrompt.title}
              </DialogTitle>
              <DialogDescription className="whitespace-pre-wrap">
                Selecione a opcao retornada pelo PayGo para continuar a operacao.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {menuPrompt.options.map((opt) => (
                <Button
                  key={`${menuPrompt.mode}-${opt.value}`}
                  variant="outline"
                  className="w-full justify-start text-left"
                  disabled={menuSubmitting}
                  onClick={() => submitPaygoMenuChoice(opt)}
                >
                  <span className="font-mono text-xs text-muted-foreground mr-2">{opt.value}</span>
                  <span>{opt.label}</span>
                </Button>
              ))}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver mensagem original
              </summary>
              <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap">
                {menuPrompt.message}
              </pre>
            </details>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setMenuPrompt(null)} disabled={menuSubmitting}>
                Cancelar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={!!captures && captures.length > 0} onOpenChange={(o) => { if (!o) cancelCapture(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {captures && captures[0] && (() => {
          const cap = captures[0];
          const isMenu = cap.tipo === 1 && cap.options && cap.options.length > 0;
          // Qualquer captura que não é menu vira entrada digitada (TYPED=2, BARCODE=12, USERAUTH=17, etc.)
          const isTyped = !isMenu;
          // USERAUTH (17) e qualquer captura com ocultar=true deve mascarar a digitação
          const isSecret = cap.ocultar || cap.tipo === 17;
          return (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />
                  {isMenu ? "Selecione uma opção" : "Entrada solicitada pelo PayGo"}
                </DialogTitle>
                <DialogDescription className="whitespace-pre-wrap">
                  {cap.prompt || (isMenu ? "Escolha uma opção do menu administrativo" : "Digite o valor solicitado")}
                </DialogDescription>
              </DialogHeader>

              {isMenu && (
                <div className="space-y-2">
                  {cap.options!.map((opt) => (
                    <Button
                      key={`${cap.identificador}-${opt.value}`}
                      variant="outline"
                      className="w-full justify-start"
                      disabled={submitting}
                      onClick={() => submitMenuOption(cap, opt.value)}
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">{opt.value}</span>
                      {opt.label}
                    </Button>
                  ))}
                </div>
              )}

              {isTyped && (
                <div className="space-y-2">
                  <Input
                    autoFocus
                    type={isSecret ? "password" : "text"}
                    maxLength={cap.tamMax || undefined}
                    placeholder={cap.mascara || ""}
                    value={captureInputs[cap.identificador] ?? ""}
                    onChange={(e) =>
                      setCaptureInputs((p) => ({ ...p, [cap.identificador]: e.target.value }))
                    }
                    onKeyDown={(e) => { if (e.key === "Enter") submitTypedAll(); }}
                  />
                  {(cap.tamMin || cap.tamMax) && (
                    <p className="text-xs text-muted-foreground">
                      Tamanho: {cap.tamMin ?? 0} – {cap.tamMax ?? "?"} caracteres
                    </p>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={cancelCapture} disabled={submitting} className="gap-1">
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                {isTyped && (
                  <Button onClick={submitTypedAll} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                  </Button>
                )}
              </DialogFooter>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
