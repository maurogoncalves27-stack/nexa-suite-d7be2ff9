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
  // PowerShell não consegue ler arquivos dentro do app.asar.
  // Em produção o electron-builder desempacota scripts/** para app.asar.unpacked.
  const inAsar = path.join(__dirname, "scripts", "paygo-bridge.ps1");
  if (inAsar.includes(`${path.sep}app.asar${path.sep}`)) {
    const unpacked = inAsar.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return inAsar;
}

function workDirCandidates(dllPath) {
  const dllDir = dllPath ? path.dirname(dllPath) : null;
  return [
    process.env.PAYGO_WORKING_DIR || null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "NexaACBr", "PayGo") : null,
    process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, "NexaACBr", "PayGo") : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, "NexaACBr", "PayGo") : null,
    dllDir,
  ].filter(Boolean).filter((dir, index, arr) => arr.indexOf(dir) === index);
}

function canUseWorkingDir(dir) {
  if (!dir) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkingDir(dllPath) {
  for (const dir of workDirCandidates(dllPath)) {
    if (canUseWorkingDir(dir)) return dir;
  }
  return dllPath ? path.dirname(dllPath) : null;
}

function formatBridgeError(payload, fallback) {
  const parts = [];
  if (payload?.function) parts.push(payload.function);
  if (payload?.ret !== undefined && payload?.ret !== null && payload.ret !== "") {
    parts.push(`ret=${payload.ret}`);
  }
  const prefix = parts.length ? `${parts.join(" ")}: ` : "";
  return prefix + (payload?.message || fallback || "Erro no host PayGo");
}

// ---------- defaults do ambiente NEXA ----------
const NEXA_DEFAULTS = {
  cpfCnpj: process.env.PAYGO_CNPJ || "44932369000108",
  pontoDeCaptura: process.env.PAYGO_PDC || "111476",
  ambiente: process.env.PAYGO_AMBIENTE || "DEMO",
  senhaTecnica: process.env.PAYGO_SENHA_TECNICA || "314159",
  pinpadPort: process.env.PAYGO_PINPAD_PORT || "5",
  qrDisplayPreference: process.env.PAYGO_QR_DISPLAY_PREF || "2",
};

// ---------- estado do host PowerShell ----------
let host = null;
let hostBuffer = "";
let hostReadyPromise = null;
let hostLastError = null;
let hostLastErrorAt = 0;
let hostLastStderr = "";
const HOST_FAIL_COOLDOWN_MS = 30000;
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

// status visível pelas rotas /tef/sale/status — usado pela UI para renderizar
// o QR Code PIX (o pinpad PPC930 não tem display gráfico, então a automação
// precisa mostrar o BR Code para o cliente escanear no app do banco).
let saleStatus = {
  status: "idle", // idle | running | done | error | timeout
  message: "",
  qrCode: "",     // BR Code Pix recebido via PWDAT_DSPQRCODE
  startedAt: 0,
  saleId: "",
  method: "",     // CREDITO | DEBITO | PIX | VOUCHER
  amount: 0,
  qrDisplayPreference: NEXA_DEFAULTS.qrDisplayPreference,
  lastQrAt: 0,
};

function setSaleStatus(patch) {
  saleStatus = { ...saleStatus, ...patch };
}

function getSaleStatus() {
  return { ...saleStatus };
}

function clearSaleStatus() {
  saleStatus = { status: "idle", message: "", qrCode: "", startedAt: 0, saleId: "", method: "", amount: 0, qrDisplayPreference: NEXA_DEFAULTS.qrDisplayPreference, lastQrAt: 0 };
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

  // Cooldown: se a última inicialização falhou há pouco, não respawna em loop.
  if (hostLastError && (Date.now() - hostLastErrorAt) < HOST_FAIL_COOLDOWN_MS) {
    const p = Promise.reject(new Error(hostLastError));
    p.catch(() => {}); // marca como tratada — não polui o console
    return p;
  }

  const dllPath = findDllPath();
  if (!dllPath) {
    hostLastError = "PGWebLib.dll não encontrada. Instale o PayGo Integrado ou defina PAYGO_DLL_PATH.";
    hostLastErrorAt = Date.now();
    const p = Promise.reject(new Error(hostLastError));
    p.catch(() => {});
    return p;
  }

  const workingDir = resolveWorkingDir(dllPath);
  const bridge = bridgeScriptPath();

  if (!fs.existsSync(bridge)) {
    hostLastError = `Bridge PayGo não encontrado em ${bridge}`;
    hostLastErrorAt = Date.now();
    const p = Promise.reject(new Error(hostLastError));
    p.catch(() => {});
    return p;
  }

  console.log("[TEF] iniciando PayGo host (PS+C#) DLL=" + dllPath);

  hostReadyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finishReady = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        hostLastError = err.message || hostLastStderr || "Host PayGo falhou ao inicializar";
        hostLastErrorAt = Date.now();
        console.warn("[TEF host] falha ao inicializar:", hostLastError);
        hostReadyPromise = null;
        reject(new Error(hostLastError));
      } else {
        hostLastError = null;
        hostLastErrorAt = 0;
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
    hostLastStderr = "";

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      hostBuffer += chunk;
      const lines = hostBuffer.split(/\r?\n/);
      hostBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { handleLine(trimmed, finishReady); }
        catch (e) { console.warn("[TEF host] erro processando linha:", e.message); }
      }
    });

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk) => {
      const msg = chunk.trim();
      if (!msg) return;
      hostLastStderr = msg.slice(-500);
      console.warn("[TEF host stderr]", msg);
    });

    proc.on("error", (err) => {
      console.error("[TEF host] erro spawn:", err.message);
      stopHost("spawn error: " + err.message);
      finishReady(err);
    });

    proc.on("exit", (code, signal) => {
      const msg = `Host PayGo encerrado code=${code ?? ""} signal=${signal ?? ""}`.trim();
      console.warn("[TEF host]", msg);
      const detail = hostLastStderr ? `${msg} :: ${hostLastStderr}` : msg;
      stopHost(detail);
      finishReady(new Error(detail));
    });
  });

  // Garante que callers que NÃO usam await (ex.: /health) não disparem
  // UnhandledPromiseRejectionWarning. Quem usa await ainda recebe a rejeição.
  hostReadyPromise.catch(() => {});

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
      finishReady(new Error(formatBridgeError(payload, resp.error || payload.message || "Host não inicializou")));
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
    p.reject(new Error(formatBridgeError(resp.payload, resp.error)));
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
  // ensureInit dentro do /health e ignora o retorno. O ensureHost já
  // anexa .catch internamente para não emitir UnhandledRejection.
  const p = ensureHost();
  p.catch(() => {}); // duplo cinto-de-segurança
  return p;
}

function versao() {
  return host ? "PGWebLib (via PS host)" : "PGWebLib (host parado)";
}

function diagnostics() {
  const dll = findDllPath();
  const candidates = workDirCandidates(dll);
  return {
    dllPath: dll || null,
    bridgePath: bridgeScriptPath(),
    bridgeExists: fs.existsSync(bridgeScriptPath()),
    hostRunning: !!host,
    initialized: !!host,
    workingDir: resolveWorkingDir(dll),
    workDirCandidates: candidates,
    defaults: { ...NEXA_DEFAULTS },
    lastInitError: hostLastError,
    lastInitErrorAt: hostLastErrorAt || null,
    lastStderr: hostLastStderr || null,
    cooldownMs: HOST_FAIL_COOLDOWN_MS,
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
  const qrDisplayPreference = String(opts.qrDisplayPreference || process.env.PAYGO_QR_DISPLAY_PREF || NEXA_DEFAULTS.qrDisplayPreference) === "1" ? "1" : "2";

  // Auto-cleanup pre-flight: se a transação anterior morreu em timeout/error,
  // a DLL PGWebLib pode ter ficado com estado "transação em andamento" e a
  // próxima venda devolve `cancelarEmAndamento`. Forçamos um desfazimento
  // best-effort antes de iniciar a nova venda.
  const prevStatus = saleStatus?.status;
  if (prevStatus === "timeout" || prevStatus === "error") {
    try {
      console.log("[TEF] Pré-cleanup automático: estado anterior=", prevStatus);
      await runBridge({ action: "cleanup" }, { timeoutMs: 15000 });
    } catch (e) {
      console.warn("[TEF] Pré-cleanup falhou (seguindo mesmo assim):", e.message);
    }
  }

  setSaleStatus({
    status: "running",
    message: `Iniciando transação no PayGo (${saleId})...`,
    qrCode: "",
    startedAt: Date.now(),
    saleId,
    method,
    amount: valor,
    qrDisplayPreference,
    lastQrAt: 0,
  });

  try {
    const payload = await runBridge({
      action: "sale",
      saleId,
      amountInCents,
      method,
      installments,
      paygoMenuChoice: opts.paygoMenuChoice || "",
      captureValuesBase64: opts.captureValuesBase64 || "",
      qrDisplayPreference,
    }, { onEvent: (ev) => {
      if (!ev) return;
      // O bridge emite eventos NDJSON: { type, message }.
      // QRCODE traz o BR Code Pix em `message` (vindo de PWINFO_AUTHPOSQRCODE).
      if (ev.type === "QRCODE" && ev.message) {
        setSaleStatus({ qrCode: ev.message, lastQrAt: Date.now(), message: `Aguardando pagamento PIX da venda ${saleId}. Cliente, escaneie o QR Code no checkout/PC.` });
      } else if (ev.message) {
        setSaleStatus({ message: ev.message });
      }
      if (typeof opts.onDisplay === "function" && ev.message) opts.onDisplay(ev.message);
    }});

    setSaleStatus({ status: "done", message: payload?.message || payload?.status || "Concluído" });
    return payload;
  } catch (err) {
    if (method === "PIX" && saleStatus.qrCode) {
      setSaleStatus({
        status: "timeout",
        message: `QR Code gerado para ${saleId}, mas o PayGo excedeu o tempo aguardando confirmação. Verifique se o Pix foi pago antes de cancelar ou repetir.`,
      });
    } else {
      setSaleStatus({ status: "error", message: err.message });
    }

    // Auto-cleanup pós-falha: desfaz pendência presa na DLL para liberar a
    // próxima venda. Best-effort, não propaga erro.
    // IMPORTANTE: se já temos QR Pix gerado, NÃO limpar — a venda pode ter
    // sido paga e o cleanup desfaria uma transação aprovada. Usuário precisa
    // confirmar manualmente via botão "Limpar pendência" na UI.
    if (method === "PIX" && saleStatus.qrCode) {
      console.log("[TEF] Pós-cleanup pulado: Pix com QR gerado, aguardando confirmação manual.");
    } else {
      try {
        console.log("[TEF] Pós-cleanup automático após falha:", err.message);
        await runBridge({ action: "cleanup" }, { timeoutMs: 15000 });
      } catch (e) {
        console.warn("[TEF] Pós-cleanup falhou:", e.message);
      }
    }

    throw err;
  }
}

async function limparPendencia() {
  try {
    const r = await runBridge({ action: "cleanup" }, { timeoutMs: 15000 });
    clearSaleStatus();
    return r;
  } catch (e) {
    // Se a DLL não respondeu, ainda assim matamos o host para garantir
    // estado limpo na próxima chamada.
    stopHost("limparPendencia-fallback");
    clearSaleStatus();
    return { ok: true, status: "cleanup", message: `Host reiniciado (${e.message})` };
  }
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

  // IMPORTANTE: no fluxo ADMIN o PayGo NÃO aceita os parâmetros de ativação
  // (USINGPINPAD/PPCOMMPORT/MERCHCNPJCPF/POSID/DESTTCPIP). Se enviados, retorna
  // -2499 (PWRET_INVPARM) em PW_iAddParam 0x7F01. Esses params são exclusivos
  // do fluxo INSTALL. Mantemos só a senha técnica para resposta de USERAUTH.
  const payload = {
    action: "admin",
    cpfCnpj: "",
    pontoDeCaptura: "",
    ambiente: "",
    senhaTecnica: opts.senhaTecnica || opts.technicalPassword || NEXA_DEFAULTS.senhaTecnica,
    usePinpad: "",
    pinpadPort: "",
    paygoMenuChoice: opts.paygoMenuChoice || "",
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
      message: result?.message || result?.status || "Concluído",
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
    ambiente: opts.host || opts.ambiente || NEXA_DEFAULTS.ambiente,
    senhaTecnica: opts.senhaTecnica ?? NEXA_DEFAULTS.senhaTecnica,
    usePinpad: opts.usePinpad === true ? "1" : opts.usePinpad === false ? "0" : "",
    pinpadPort: opts.usePinpad === true ? String(opts.pinpadPort || NEXA_DEFAULTS.pinpadPort) : "",
    paygoMenuChoice: opts.paygoMenuChoice || "",
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
  limparPendencia,
  administrativoAsync,
  getAdmStatus,
  getSaleStatus,
  clearSaleStatus,
  abortAdm,
  respondAdm,
  instalarPdc,
  finalizar,
  // exports usados em testes/diagnóstico
  _NEXA_DEFAULTS: NEXA_DEFAULTS,
  _findDllPath: findDllPath,
};
