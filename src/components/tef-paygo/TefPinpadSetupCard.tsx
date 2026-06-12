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
  paygoInit,
  paygoTestarPinpad,
  paygoAdmStatus,
  paygoAdmRespond,
  paygoAdmAbort,
  type PaygoAdmCapture,
} from "@/lib/tef/paygoAdapter";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

interface Props {
  storeId?: string | null;
}

export default function TefPinpadSetupCard({ storeId }: Props) {
  const effectiveStoreId = storeId || ASA_SUL_ID;
  const [busy, setBusy] = useState<"adm" | "test" | "diag" | "init" | "port" | null>(null);
  const [lastMsg, setLastMsg] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [fetchFailed, setFetchFailed] = useState(false);
  const [captures, setCaptures] = useState<PaygoAdmCapture[] | null>(null);
  const [captureInputs, setCaptureInputs] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const lastCaptureSeqRef = useRef<number>(0);

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
          setLastMsg(st.error);
          if (st.receipts) setResult(JSON.stringify(st.receipts, null, 2));
          toast({ title: "Erro", description: st.error, variant: "destructive" });
        } else if (st.status === "done") {
          const r = (st.receipts as any) ?? {};
          setResult(JSON.stringify(r, null, 2));
          setLastMsg(r.resultado || "Operação concluída");
          toast({ title: "OK", description: r.resultado || "Operação concluída" });
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
    setLastMsg("Chamando PW_iInit na PGWebLib...");
    setResult("");
    setFetchFailed(false);
    try {
      const cfg = await loadTefConfig(effectiveStoreId);
      const resp = await paygoInit(cfg.agentUrl);
      if (!resp.ok) {
        const err = resp.error ?? "Falha ao inicializar";
        setLastMsg(err);
        if (isFetchFail(err)) setFetchFailed(true);
        toast({ title: "Erro", description: err, variant: "destructive" });
      } else {
        const v = resp.retorno?.version ?? "PGWebLib";
        setLastMsg(`TEF inicializado — ${v}`);
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
      const resp = await paygoAdministrativo(cfg.agentUrl, {
        technicalPassword: "314159",
        pinpadPort: Number((cfg as any).pinpadPort ?? (cfg as any).pinpad_port ?? 5) || 5,
        merchantCode: cfg.merchantCode,
        terminalCode: cfg.terminalCode,
        host: cfg.environment === "demo" ? "pos-transac-sb.tpgweb.io:31735" : undefined,
      });
      if (!resp.ok && !(resp as any).started) {
        const err = resp.error ?? "Falha na operação ADM";
        setLastMsg(err);
        if (isFetchFail(err)) setFetchFailed(true);
        toast({ title: "Erro", description: err, variant: "destructive" });
      } else {
        const msg = (resp as any).message ?? resp.retorno?.resultado ?? "Menu aberto no pinpad. Aguardando interação...";
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

  return (
    <>
    <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <Usb className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Configurar pinpad</h2>
        <Badge variant="outline" className="ml-auto">
          {storeId ? "Loja selecionada" : "ASA SUL (padrão)"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Abre o menu administrativo da PGWebLib direto no pinpad. Use{" "}
        <strong>Abrir menu ADM</strong> e escolha <em>"Instalação do Pinpad"</em> para
        parear a porta COM; depois rode <strong>Testar comunicação</strong> para
        confirmar que o pinpad está respondendo.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={inicializar} disabled={!!busy} className="gap-2">
          {busy === "init" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          Inicializar TEF agora
        </Button>
        <Button onClick={() => run("adm")} disabled={!!busy} variant="secondary" className="gap-2">
          {busy === "adm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
          Abrir menu ADM
        </Button>
        <Button onClick={() => run("test")} disabled={!!busy} variant="secondary" className="gap-2">
          {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
          Testar comunicação
        </Button>
        <Button onClick={testarPortaPinpad} disabled={!!busy} variant="outline" className="gap-2 border-success/40 text-success hover:bg-success/10">
          {busy === "port" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Testar porta do pinpad
        </Button>
        <Button onClick={diagnosticar} disabled={!!busy} variant="outline" className="gap-2">
          {busy === "diag" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          Diagnosticar agente
        </Button>
      </div>

      {agentUrl && (
        <p className="text-xs text-muted-foreground">
          Agente: <code className="font-mono">{agentUrl}</code>
        </p>
      )}

      {lastMsg && (
        <div className="rounded-md border bg-background p-2.5 text-sm">
          <span className="text-muted-foreground">Status:</span> {lastMsg}
        </div>
      )}

      {fetchFailed && agentUrl && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-2">
          <p className="font-medium">"Failed to fetch" — provável causa:</p>
          <ol className="list-decimal pl-5 space-y-1 text-xs">
            <li>O agente <code>NEXA ACBr Agent</code> não está rodando na máquina (verifique a bandeja do Windows).</li>
            <li>O certificado HTTPS auto-assinado em <code>{agentUrl}</code> ainda não foi aceito por este navegador.</li>
            <li>Algum antivírus/firewall está bloqueando a porta 3031.</li>
          </ol>
          <p className="text-xs">
            <strong>Como resolver:</strong> abra o link abaixo em uma nova aba, clique em <em>"Avançado → Continuar para 127.0.0.1"</em> e depois volte aqui.
          </p>
          <a
            href={`${agentUrl}/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir {agentUrl}/health
          </a>
        </div>
      )}

      {result && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver resposta completa
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 font-mono">
            {result}
          </pre>
        </details>
      )}
    </Card>

    <Dialog open={!!captures && captures.length > 0} onOpenChange={(o) => { if (!o) cancelCapture(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {captures && captures[0] && (() => {
          const cap = captures[0];
          const isMenu = cap.tipo === 1 && cap.options && cap.options.length > 0;
          const isTyped = cap.tipo === 2 || cap.tipo === 3;
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
                    type={cap.ocultar ? "password" : "text"}
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
