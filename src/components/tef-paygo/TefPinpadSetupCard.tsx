/**
 * Card "Configurar pinpad" — dispara a operação ADM da PGWebLib via
 * NEXA Agent para parear/testar a porta do pinpad.
 *
 * "Abrir menu ADM" e "Testar comunicação" usam o mesmo endpoint
 * /tef/admin (PWOPER.ADMIN = 0x20). A diferença prática é a opção
 * que o operador escolhe no menu mostrado no próprio pinpad
 * (Instalação do Pinpad x Teste de Comunicação).
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Usb, Loader2, Wifi, Settings2, ExternalLink, Activity, Power, Plug } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig } from "@/lib/tef";
import { paygoAdministrativo, checkPaygoAgent, paygoInit, paygoTestarPinpad } from "@/lib/tef/paygoAdapter";

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

interface Props {
  storeId?: string | null;
}

export default function TefPinpadSetupCard({ storeId }: Props) {
  const effectiveStoreId = storeId || ASA_SUL_ID;
  const [busy, setBusy] = useState<"adm" | "test" | "diag" | "init" | null>(null);
  const [lastMsg, setLastMsg] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [agentUrl, setAgentUrl] = useState<string>("");
  const [fetchFailed, setFetchFailed] = useState(false);

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
      const resp = await paygoAdministrativo(cfg.agentUrl);
      if (!resp.ok) {
        const err = resp.error ?? "Falha na operação ADM";
        setLastMsg(err);
        if (isFetchFail(err)) setFetchFailed(true);
        toast({ title: "Erro", description: err, variant: "destructive" });
      } else {
        const msg = resp.retorno?.resultado ?? "Operação concluída";
        setLastMsg(msg);
        setResult(JSON.stringify(resp.retorno ?? {}, null, 2));
        toast({ title: "OK", description: msg });
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
  );
}
