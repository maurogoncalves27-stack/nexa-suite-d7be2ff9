// ============================================================
// TEF PayGo Integrado — Adapter para PGWebLib.dll
// ============================================================
// IMPORTANTE: arquitetura nova (12/06/2026) — agora o adapter
// roda um "host" persistente em PowerShell + C# (P/Invoke) na
// PGWebLib.dll. É a mesma estratégia usada na demo oficial de
// referência (https://github.com/luiz-cesar-almeida/integracao_tef_paygo)
// e substitui completamente o fluxo antigo que tentava chamar
// a DLL via FFI direto do Node — que travava em "Iniciando..."
// e dava timeout.
//
// Por que PowerShell + C# em vez de FFI?
//   1) C# P/Invoke é a forma OFICIAL e estável de falar com a
//      PGWebLib.dll no Windows (todos os exemplos Setis usam).
//   2) PowerShell roda em x64 nativo, então acessa a DLL sem o
//      "ffi-napi não acha a função" típico do node-ffi-napi.
//   3) O PS bridge implementa todo o loop PW_iPPEventLoop em C#,
//      que é onde a nossa versão antiga ficava parada.
//
// Fluxo:
//   - spawn powershell.exe -File scripts/paygo-bridge.ps1 -Action host
//   - linhas JSON via stdin: { id, action, ... }
//   - respostas JSON via stdout: { id, payload, error?, event? }
//   - 1ª linha do host: { id:"__ready", payload:{ ok:true } }
//
// API exposta pra server.cjs:
//   isAvailable(), ensureInit(), versao(), diagnostics(),
//   efetuarPagamento(), cancelarVenda(), cancelarEmAndamento(),
//   administrativoAsync(), getAdmStatus(), abortAdm(), respondAdm(),
//   instalarPdc(), finalizar()
//
// Defaults travados pro nosso ambiente sandbox (NEXA):
//   PdC=111476, CNPJ=44932369000108, ambiente=DEMO,
//   senha técnica=314159, pinpad porta=5
// ============================================================

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------- caminhos de DLL e diretório de trabalho ----------
const DEFAULT_DLL_PATHS = [
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\PGWebLib.dll",
];

function findDllPath() {
  if (process.env.PAYGO_DLL_PATH && fs.existsSync(process.env.PAYGO_DLL_PATH)) {
    return process.env.PAYGO_DLL_PATH;
  }
  for (const p of DEFAULT_DLL_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function bridgeScriptPath() {
  return path.join(__dirname, "scripts", "paygo-bridge.ps1");
}

// ---------- defaults do ambiente NEXA ----------
const NEXA_DEFAULTS = {
  cpfCnpj: process.env.PAYGO_CNPJ || "44932369000108",
  pontoDeCaptura: process.env.PAYGO_PDC || "111476",
  ambiente: process.env.PAYGO_AMBIENTE || "DEMO",
  senhaTecnica: process.env.PAYGO_SENHA_TECNICA || "314159",
  pinpadPort: process.env.PAYGO_PINPAD_PORT || "5",
};

// ---------- estado do host PowerShell ----------
let host = null;
let hostBuffer = "";
let hostReadyPromise = null;
let nextRequestId = 0;
const pending = new Map(); // id -> { resolve, reject, timeout, onEvent }

// status visível pelas rotas /tef/admin/status
let admStatus = {
  status: "idle",       // idle | running | done | error | aborted
  message: "",
  startedAt: 0,
  result: null,
  error: null,
};

function setAdmStatus(patch) {
  admStatus = { ...admStatus, ...patch };
}

function getAdmStatus() {
  return { ...admStatus };
}

// ---------- spawn / shutdown ----------
function stopHost(reason) {
  if (host) {
    try { host.kill(); } catch { /* ignore */ }
  }
  host = null;
  hostReadyPromise = null;
  hostBuffer = "";
  for (const p of pending.values()) {
    try { clearTimeout(p.timeout); } catch { /* ignore */ }
    p.reject(new Error(reason || "Host PayGo encerrado"));
  }
  pending.clear();
}

function ensureHost() {
  if (hostReadyPromise) return hostReadyPromise;

  const dllPath = findDllPath();
  if (!dllPath) {
    return Promise.reject(new Error(
      "PGWebLib.dll não encontrada. Instale o PayGo Integrado ou defina PAYGO_DLL_PATH."
    ));
  }

  const workingDir = process.env.PAYGO_WORKING_DIR || path.dirname(dllPath);
  const bridge = bridgeScriptPath();

  if (!fs.existsSync(bridge)) {
    return Promise.reject(new Error(`Bridge PayGo não encontrado em ${bridge}`));
  }

  console.log("[TEF] iniciando PayGo host (PS+C#) DLL=" + dllPath);

  hostReadyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finishReady = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        hostReadyPromise = null;
        reject(err);
      } else {
        resolve();
      }
    };

    const proc = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", bridge,
        "-Action", "host",
        "-DllPath", dllPath,
        "-WorkingDir", workingDir,
      ],
      { windowsHide: true }
    );

    host = proc;

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      hostBuffer += chunk;
      const lines = hostBuffer.split(/\r?\n/);
      hostBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        handleLine(trimmed, finishReady);
      }
    });

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk) => {
      const msg = chunk.trim();
      if (!msg) return;
      console.warn("[TEF host stderr]", msg);
      // não derruba o ready imediatamente — o host pode emitir warnings
    });

    proc.on("error", (err) => {
      console.error("[TEF host] erro spawn:", err.message);
      stopHost("spawn error: " + err.message);
      finishReady(err);
    });

    proc.on("exit", (code, signal) => {
      const msg = `Host PayGo encerrado code=${code ?? ""} signal=${signal ?? ""}`.trim();
      console.warn("[TEF host]", msg);
      stopHost(msg);
      finishReady(new Error(msg));
    });
  });

  return hostReadyPromise;
}

function handleLine(line, finishReady) {
  let resp;
  try { resp = JSON.parse(line); }
  catch {
    console.log("[TEF host raw]", line);
    return;
  }

  if (resp.id === "__ready") {
    const payload = resp.payload || {};
    if (resp.error || payload.ok === false) {
      finishReady(new Error(resp.error || payload.message || "Host não inicializou"));
    } else {
      console.log("[TEF host] pronto:", payload.message || "ready");
      finishReady(null);
    }
    return;
  }

  const p = pending.get(resp.id);
  if (!p) {
    console.log("[TEF host orphan]", line.slice(0, 200));
    return;
  }

  if (resp.event) {
    // evento intermediário (display do pinpad, info, etc) — não resolve
    if (p.onEvent) {
      try { p.onEvent(resp.event); } catch { /* ignore */ }
    }
    return;
  }

  try { clearTimeout(p.timeout); } catch { /* ignore */ }
  pending.delete(resp.id);

  if (resp.error) {
    p.reject(new Error(resp.error));
    return;
  }

  p.resolve(resp.payload);
}

function runBridge(payload, opts = {}) {
  return ensureHost().then(() => new Promise((resolve, reject) => {
    if (!host || !host.stdin.writable) {
      hostReadyPromise = null;
      return reject(new Error("Host PayGo indisponível"));
    }

    const id = String(++nextRequestId);
    const timeoutMs = opts.timeoutMs ?? Number(process.env.PAYGO_BRIDGE_TIMEOUT_MS || 600000);
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout aguardando resposta do PayGo host (${timeoutMs}ms)`));
      stopHost("timeout");
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeout, onEvent: opts.onEvent });

    const line = JSON.stringify({ id, ...payload }) + "\n";
    host.stdin.write(line, "utf8", (err) => {
      if (!err) return;
      clearTimeout(timeout);
      pending.delete(id);
      stopHost("stdin write error");
      reject(err);
    });
  }));
}

// ---------- API pública ----------
function isAvailable() {
  return !!findDllPath();
}

function ensureInit(opts = {}) {
  // mantém compat com chamadas síncronas antigas: agora só garante que
  // o host PS está spawned. Retorna uma promise; o server.cjs já chama
  // ensureInit dentro do /health e ignora o retorno.
  return ensureHost();
}

function versao() {
  return host ? "PGWebLib (via PS host)" : "PGWebLib (host parado)";
}

function diagnostics() {
  const dll = findDllPath();
  return {
    dllPath: dll || null,
    bridgePath: bridgeScriptPath(),
    bridgeExists: fs.existsSync(bridgeScriptPath()),
    hostRunning: !!host,
    initialized: !!host,
    workingDir: process.env.PAYGO_WORKING_DIR || (dll ? path.dirname(dll) : null),
    defaults: { ...NEXA_DEFAULTS },
  };
}

// ---------- venda ----------
function methodToBridge(method) {
  const m = String(method || "").toUpperCase();
  if (m === "CREDITO" || m === "CRÉDITO" || m === "CREDIT") return "CREDITO";
  if (m === "DEBITO" || m === "DÉBITO" || m === "DEBIT") return "DEBITO";
  if (m === "PIX") return "PIX";
  if (m === "VOUCHER") return "VOUCHER";
  return "DEBITO";
}

async function efetuarPagamento(opts = {}) {
  const valor = Number(opts.valor || 0);
  if (!valor || valor <= 0) throw new Error("valor obrigatório");
  const amountInCents = Math.round(valor * 100);
  const installments = Number(opts.parcelas || 1);
  const method = methodToBridge(opts.tipo);
  const saleId = opts.saleId || `SALE-${Date.now()}`;

  const payload = await runBridge({
    action: "sale",
    saleId,
    amountInCents,
    method,
    installments,
    paygoMenuChoice: opts.paygoMenuChoice || "",
    captureValuesBase64: opts.captureValuesBase64 || "",
  }, { onEvent: (ev) => {
    if (typeof opts.onDisplay === "function" && ev.message) opts.onDisplay(ev.message);
  }});

  return payload;
}

async function cancelarVenda(opts = {}) {
  // Para desfazimento o bridge espera o token de confirmação base64.
  if (!opts.confirmationJsonBase64) {
    throw new Error("confirmationJsonBase64 obrigatório (token PGWEB:)");
  }
  return runBridge({
    action: "undo",
    confirmationJsonBase64: opts.confirmationJsonBase64,
  });
}

async function confirmarVenda(opts = {}) {
  if (!opts.confirmationJsonBase64) {
    throw new Error("confirmationJsonBase64 obrigatório (token PGWEB:)");
  }
  return runBridge({
    action: "confirm",
    confirmationJsonBase64: opts.confirmationJsonBase64,
  });
}

function cancelarEmAndamento() {
  // Mata o host atual — a próxima chamada respawn.
  stopHost("cancelarEmAndamento");
}

// ---------- ADM / instalação ----------
async function administrativoAsync(opts = {}) {
  setAdmStatus({
    status: "running",
    message: "Iniciando operação administrativa...",
    startedAt: Date.now(),
    result: null,
    error: null,
  });

  const payload = {
    action: "admin",
    cpfCnpj: opts.cpfCnpj || NEXA_DEFAULTS.cpfCnpj,
    pontoDeCaptura: opts.pontoDeCaptura || opts.terminalCode || NEXA_DEFAULTS.pontoDeCaptura,
    ambiente: opts.ambiente || NEXA_DEFAULTS.ambiente,
    senhaTecnica: opts.senhaTecnica || opts.technicalPassword || NEXA_DEFAULTS.senhaTecnica,
    usePinpad: opts.usePinpad === false ? "0" : "1",
    pinpadPort: String(opts.pinpadPort || NEXA_DEFAULTS.pinpadPort),
  };

  try {
    const result = await runBridge(payload, {
      timeoutMs: opts.timeoutMs || 600000,
      onEvent: (ev) => {
        if (ev.message) setAdmStatus({ message: ev.message });
      },
    });
    setAdmStatus({
      status: "done",
      message: result?.message || result?.resultado || "Concluído",
      result,
    });
    return result;
  } catch (err) {
    setAdmStatus({
      status: "error",
      message: err.message,
      error: err.message,
    });
    throw err;
  }
}

async function instalarPdc(opts = {}) {
  // Mantido pra compatibilidade da rota /tef/install — mas o método
  // OFICIAL recomendado pela Setis é instalar via UI do PayGo Windows
  // em modo DEMO (3 cliques no logo). Use isso só em ambiente já
  // configurado pra reaproveitar o PdC.
  const payload = {
    action: "install",
    cpfCnpj: opts.cpfCnpj || NEXA_DEFAULTS.cpfCnpj,
    pontoDeCaptura: opts.pontoDeCaptura || NEXA_DEFAULTS.pontoDeCaptura,
    ambiente: opts.ambiente || NEXA_DEFAULTS.ambiente,
    senhaTecnica: opts.senhaTecnica || NEXA_DEFAULTS.senhaTecnica,
    usePinpad: opts.usePinpad === false ? "0" : "1",
    pinpadPort: String(opts.pinpadPort || NEXA_DEFAULTS.pinpadPort),
  };
  return runBridge(payload, { timeoutMs: opts.timeoutMs || 600000 });
}

function abortAdm() {
  setAdmStatus({ status: "aborted", message: "Operação abortada" });
  stopHost("abortAdm");
}

function respondAdm(_responses) {
  // O bridge do amigo NÃO usa o fluxo interativo de captura (PWDAT_MENU/TYPED)
  // — em vez disso ele exige que o paygoMenuChoice/captureValues venham antes
  // da chamada. Por enquanto este endpoint é no-op; a UI já está sendo
  // ajustada pra coletar a escolha antes de disparar o comando.
  throw new Error(
    "Fluxo de captura interativa não é suportado no novo host. " +
    "Envie paygoMenuChoice no payload inicial."
  );
}

function finalizar() {
  stopHost("finalizar");
}

module.exports = {
  isAvailable,
  ensureInit,
  versao,
  diagnostics,
  efetuarPagamento,
  cancelarVenda,
  confirmarVenda,
  cancelarEmAndamento,
  administrativoAsync,
  getAdmStatus,
  abortAdm,
  respondAdm,
  instalarPdc,
  finalizar,
  // exports usados em testes/diagnóstico
  _NEXA_DEFAULTS: NEXA_DEFAULTS,
  _findDllPath: findDllPath,
};
