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
const { EventEmitter } = require("events");

// ---------- caminhos de DLL e diretório de trabalho ----------
const FORCED_PAYGO_DLL_PATH = "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll";
const DEFAULT_DLL_PATHS = [
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\PGWebLib.dll",
];

function findDllPath() {
  // Regra do projeto: priorizar sempre a DLL oficial em x64.
  if (fs.existsSync(FORCED_PAYGO_DLL_PATH)) {
    return FORCED_PAYGO_DLL_PATH;
  }
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
    // Alinhado com a aplicacao de referencia: por padrao a PGWebLib
    // trabalha a partir da propria pasta da DLL (ex.: ...\PGWebLib\x64).
    dllDir,
    // Fallbacks Nexa (somente se a pasta da DLL nao for utilizavel).
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "NexaACBr", "PayGo") : null,
    process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, "NexaACBr", "PayGo") : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, "NexaACBr", "PayGo") : null,
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
  const dllDir = dllPath ? path.dirname(dllPath) : null;

  // Com a PGWebLib instalada em Program Files, usa SEMPRE a pasta da DLL
  // (mesmo comportamento da demo de referencia). Ignora PAYGO_WORKING_DIR
  // apontando para AppData/NexaACBr, que gera config/certificados divergentes.
  if (dllPath === FORCED_PAYGO_DLL_PATH && dllDir) {
    return dllDir;
  }

  const forcedDir = process.env.PAYGO_WORKING_DIR;
  if (forcedDir && canUseWorkingDir(forcedDir)) return forcedDir;

  if (dllDir) return dllDir;

  for (const dir of workDirCandidates(dllPath)) {
    if (canUseWorkingDir(dir)) return dir;
  }
  return null;
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

const PENDING_DIR = path.join(
  process.env.APPDATA || path.join(process.env.HOME || process.cwd(), "AppData", "Roaming"),
  "nexa-acbr-agent",
);
const PENDING_FILE = path.join(PENDING_DIR, "paygo-pending-confirmation.json");
const STARTUP_PENDING_ACTION = (process.env.PAYGO_STARTUP_PENDING_ACTION || "manual").toLowerCase();

function ensurePendingDir() {
  try { fs.mkdirSync(PENDING_DIR, { recursive: true }); } catch { /* ignore */ }
}

function loadPendingConfirmation() {
  try {
    if (!fs.existsSync(PENDING_FILE)) return null;
    const raw = fs.readFileSync(PENDING_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.reqNum || !parsed.locRef || !parsed.extRef || !parsed.virtMerch || !parsed.authSyst) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePendingConfirmation(data) {
  if (!data?.reqNum || !data?.locRef || !data?.extRef || !data?.virtMerch || !data?.authSyst) return false;
  ensurePendingDir();
  const record = {
    reqNum: String(data.reqNum),
    locRef: String(data.locRef),
    extRef: String(data.extRef),
    virtMerch: String(data.virtMerch),
    authSyst: String(data.authSyst),
    sourceStatus: data.sourceStatus || "unknown",
    reason: data.reason || "",
    createdAt: new Date().toISOString(),
  };
  if (Number.isFinite(Number(data.amountCentavos)) && Number(data.amountCentavos) > 0) {
    record.amountCentavos = Math.round(Number(data.amountCentavos));
  }
  if (data.saleId) record.saleId = String(data.saleId);
  if (data.merchantReceipt) record.merchantReceipt = String(data.merchantReceipt);
  if (data.customerReceipt) record.customerReceipt = String(data.customerReceipt);
  fs.writeFileSync(PENDING_FILE, JSON.stringify(record, null, 2));
  return true;
}

function clearPendingConfirmation() {
  try {
    if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE);
  } catch { /* ignore */ }
}

// Rastreia reqNums recentemente confirmados/desfeitos pelo operador. Após
// PW_iConfirmation retornar OK, a PGWebLib às vezes ainda expõe PWINFO_PND*
// preenchido no próximo PW_iInit (residual em memória/arquivo local antes do
// host processar a baixa). Sem esse dedup, o probe da próxima venda enxerga o
// MESMO reqNum já resolvido e re-abre o modal de pendência indefinidamente.
const RECENTLY_RESOLVED_TTL_MS = 5 * 60 * 1000;
const recentlyResolvedPending = new Map(); // reqNum -> { at, action }

function markPendingResolved(reqNum, action) {
  if (!reqNum) return;
  const now = Date.now();
  recentlyResolvedPending.set(String(reqNum), { at: now, action });
  for (const [key, val] of recentlyResolvedPending) {
    if (now - val.at > RECENTLY_RESOLVED_TTL_MS) recentlyResolvedPending.delete(key);
  }
}

function wasRecentlyResolved(reqNum) {
  if (!reqNum) return false;
  const entry = recentlyResolvedPending.get(String(reqNum));
  if (!entry) return false;
  if (Date.now() - entry.at > RECENTLY_RESOLVED_TTL_MS) {
    recentlyResolvedPending.delete(String(reqNum));
    return false;
  }
  return true;
}

function encodeConfirmationJson(data) {
  return Buffer.from(JSON.stringify({
    reqNum: data.reqNum,
    locRef: data.locRef,
    extRef: data.extRef,
    virtMerch: data.virtMerch,
    authSyst: data.authSyst,
  }), "utf8").toString("base64");
}

function decodeConfirmationJsonBase64(confirmationJsonBase64) {
  if (!confirmationJsonBase64) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(confirmationJsonBase64), "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveConfirmationJsonBase64(opts = {}) {
  const pending = loadPendingConfirmation();
  const explicit = decodeConfirmationJsonBase64(opts.confirmationJsonBase64);
  const tuple = explicit
    ? {
        reqNum: explicit.reqNum || pending?.reqNum || "",
        locRef: explicit.locRef || pending?.locRef || "",
        extRef: explicit.extRef || pending?.extRef || "",
        virtMerch: explicit.virtMerch || pending?.virtMerch || "",
        authSyst: explicit.authSyst || pending?.authSyst || "",
      }
    : pending;
  return tuple?.reqNum ? encodeConfirmationJson(tuple) : "";
}

function maybePersistPendingFromPayload(payload, reason, saleMeta) {
  const d = payload?.data;
  if (!d || typeof d !== "object") return false;
  const tuple = {
    reqNum: d.reqNum,
    locRef: d.locRef,
    extRef: d.extRef,
    virtMerch: d.virtMerch,
    authSyst: d.authSyst,
    sourceStatus: payload?.status || "unknown",
    reason: reason || payload?.message || "",
    amountCentavos: saleMeta?.amountCentavos || parsePayGoAmountCentavos(d),
    saleId: saleMeta?.saleId,
    merchantReceipt: d?.merchantReceipt || undefined,
    customerReceipt: d?.customerReceipt || undefined,
  };
  return savePendingConfirmation(tuple);
}

function parsePayGoAmountCentavos(data) {
  if (!data || typeof data !== "object") return undefined;
  const raw = data?.amountInCents ?? data?.totAmnt ?? data?.amount ?? null;
  const cents = Number(raw);
  return Number.isFinite(cents) && cents > 0 ? Math.round(cents) : undefined;
}

function parseAmountCentavosFromReceipt(...receipts) {
  for (const receipt of receipts) {
    const text = String(receipt || "");
    if (!text) continue;
    const patterns = [
      /VALOR\s*:?\s*R\$\s*([\d.,]+)/i,
      /VALOR\s+([\d.,]+)/i,
      /TOTAL\s*:?\s*R\$\s*([\d.,]+)/i,
      /R\$\s*([\d.,]+)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const normalized = match[1].includes(",")
        ? match[1].replace(/\./g, "").replace(",", ".")
        : match[1];
      const value = Number(normalized);
      if (Number.isFinite(value) && value > 0) return Math.round(value * 100);
    }
  }
  return undefined;
}

function paygoTupleFromRecord(data) {
  if (!data || typeof data !== "object") return null;
  const reqNum = data.reqNum || data.REQNUM || null;
  if (!reqNum) return null;
  return {
    reqNum: String(reqNum),
    locRef: String(data.locRef || data.LOC_REF || ""),
    extRef: String(data.extRef || data.EXT_REF || ""),
    virtMerch: String(data.virtMerch || data.VIRT_MERCH || ""),
    authSyst: String(data.authSyst || data.AUTH_SYST || data.acquirer || ""),
  };
}

function isPayGoHostBusy() {
  const st = String(saleStatus?.status || "");
  // `waiting_confirmation` não é uma transação em andamento na DLL; é apenas
  // estado local aguardando decisão do operador. Se tratarmos isso como busy,
  // o probe de pendência nunca roda e um arquivo local antigo bloqueia vendas novas.
  if (st === "running" || st === "waiting_input") return true;
  if (currentSalePaymentId || currentSaleRequestId) return true;
  if (admStatus.status === "running" || admStatus.status === "waiting_input") return true;
  return false;
}

function buildPendingDetailsFromStored(stored, probePayload = null, probeData = {}) {
  const probeTuple = paygoTupleFromRecord(probeData);
  const tuple = stored || probeTuple;
  const amountCentavos =
    Number(stored?.amountCentavos || 0) ||
    parsePayGoAmountCentavos(probeData) ||
    parseAmountCentavosFromReceipt(stored?.merchantReceipt, stored?.customerReceipt, probeData?.merchantReceipt, probeData?.customerReceipt) ||
    null;

  if (stored && amountCentavos && !stored.amountCentavos) {
    savePendingConfirmation({
      ...stored,
      amountCentavos,
      merchantReceipt: stored.merchantReceipt || probeData?.merchantReceipt || undefined,
      customerReceipt: stored.customerReceipt || probeData?.customerReceipt || undefined,
    });
  }

  return {
    hasPending: !!(tuple?.reqNum),
    pending: stored,
    probe: probeData?.reqNum ? probeData : null,
    probeStatus: probePayload?.status || (isPayGoHostBusy() ? "saleBusy" : null),
    tuple,
    amountCentavos,
    saleId: stored?.saleId || null,
    reason: stored?.reason || probePayload?.message || null,
    brand: probeData?.brand || null,
    authCode: probeData?.authCode || null,
    merchantReceipt: stored?.merchantReceipt || probeData?.merchantReceipt || null,
    customerReceipt: stored?.customerReceipt || probeData?.customerReceipt || null,
  };
}

async function getPendingDetails() {
  const stored = loadPendingConfirmation();
  if (isPayGoHostBusy()) {
    return buildPendingDetailsFromStored(stored);
  }

  let probePayload = null;
  let probeData = {};
  try {
    await ensureHost();
    probePayload = await runBridge(
      { action: "pending" },
      { timeoutMs: 8000, stopHostOnTimeout: false },
    );
    probeData = probePayload?.data && typeof probePayload.data === "object"
      ? probePayload.data
      : {};
  } catch (e) {
    console.warn("[TEF] getPendingDetails probe:", e.message);
  }

  if (stored?.reqNum && probePayload?.status === "noPending") {
    console.log("[TEF] Pendência local stale removida; PayGo respondeu sem pendência.");
    clearPendingConfirmation();
    return buildPendingDetailsFromStored(null, probePayload, probeData);
  }

  return buildPendingDetailsFromStored(stored, probePayload, probeData);
}

const PAYGO_PENDING_RET = -2599;
const PAYGO_HOST_COMM_ERRORS = new Set([-2582, -2583, -2584, -2585, -2586, -2587]);

function hasPayGoConfirmationTuple(data) {
  if (!data || typeof data !== "object") return false;
  return !!(data.reqNum && data.locRef && data.extRef && data.virtMerch && data.authSyst);
}

function isPayGoPendingPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.status === "pendingConfirmation") return true;
  if (Number(payload.ret) === PAYGO_PENDING_RET) return true;
  // CNFREQ=1 em uma transação aprovada significa apenas "precisa confirmar".
  // Não é pendência real: quando a confirmação manual está desmarcada, o server
  // deve seguir e chamar confirmarVenda automaticamente. Só tratamos como
  // pendente quando há erro de comunicação/retorno explícito de pendência.
  return hasPayGoConfirmationTuple(payload.data)
    && PAYGO_HOST_COMM_ERRORS.has(Number(payload.ret));
}

function finishPendingSale(paymentId, payload, reason, saleMeta) {
  maybePersistPendingFromPayload(payload, reason, saleMeta);
  const message = payload?.message || "Transação pendente de confirmação.";
  setSaleStatus({ status: "waiting_confirmation", message, pendingCaptures: null });
  emitSaleEvent({ paymentId, type: "PENDING", message, payload });
  return payload;
}

async function probePendingTransaction() {
  if (isPayGoHostBusy()) return null;
  try {
    const payload = await runBridge(
      { action: "pending" },
      { timeoutMs: 8000, stopHostOnTimeout: false },
    );
    if (payload?.status === "pendingConfirmation" && hasPayGoConfirmationTuple(payload?.data)) {
      return payload;
    }
  } catch (e) {
    console.warn("[TEF] Falha ao sondar pendência PayGo:", e.message);
  }
  return null;
}

async function reconcilePendingAtStartup() {
  const pending = loadPendingConfirmation();
  if (!pending) return;
  if (STARTUP_PENDING_ACTION === "manual") {
    console.warn("[TEF] Pendência de confirmação encontrada no startup. Aguardando ação manual (/tef/confirm ou /tef/undo).");
    return;
  }
  if (STARTUP_PENDING_ACTION !== "confirm" && STARTUP_PENDING_ACTION !== "undo") return;
  try {
    const action = STARTUP_PENDING_ACTION === "confirm" ? "confirm" : "undo";
    const confirmationJsonBase64 = encodeConfirmationJson(pending);
    const r = await runBridge({ action, confirmationJsonBase64 }, { timeoutMs: 30000 });
    if (r?.ok) {
      console.log(`[TEF] Pendência resolvida automaticamente no startup via ${action}.`);
      clearPendingConfirmation();
    } else {
      console.warn(`[TEF] Falha ao resolver pendência no startup via ${action}:`, r?.message || "erro desconhecido");
    }
  } catch (e) {
    console.warn("[TEF] Erro ao resolver pendência no startup:", e.message);
  }
}

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
  status: "idle",       // idle | running | waiting_input | done | error | aborted
  message: "",
  startedAt: 0,
  result: null,
  receipts: null,
  error: null,
  pendingCaptures: null, // CAPTURE_REQUEST emitidos pelo bridge aguardando resposta
  captureSeq: 0,
};

// Id do request /tef/admin atualmente em execução (usado por respondAdm pra
// escrever capture_response no stdin do host PowerShell).
let currentAdminRequestId = null;

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
  pendingCaptures: null,
  captureSeq: 0,
};

function setSaleStatus(patch) {
  saleStatus = { ...saleStatus, ...patch };
}

function getSaleStatus() {
  return { ...saleStatus };
}

function clearSaleStatus() {
  saleStatus = { status: "idle", message: "", qrCode: "", startedAt: 0, saleId: "", method: "", amount: 0, qrDisplayPreference: NEXA_DEFAULTS.qrDisplayPreference, lastQrAt: 0, pendingCaptures: null, captureSeq: 0 };
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

  console.log("[TEF] iniciando PayGo host (PS+C#) DLL=" + dllPath + " workingDir=" + workingDir);

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
    const eventType = resp.event.type || "INFO";
    const eventMessage = resp.event.message || "";
    console.log(`[TEF host event] ${eventType}: ${eventMessage}`);
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
    const stopHostOnTimeout = opts.stopHostOnTimeout !== false;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout aguardando resposta do PayGo host (${timeoutMs}ms)`));
      if (stopHostOnTimeout) stopHost("timeout");
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeout, onEvent: opts.onEvent });

    if (typeof opts.onRequestId === "function") {
      try { opts.onRequestId(id); } catch { /* ignore */ }
    }

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

// Escreve uma linha JSON direto na stdin do host PayGo. Usado pra responder
// um CAPTURE_REQUEST que o bridge está bloqueando aguardando.
function writeHostLine(obj) {
  if (!host || !host.stdin || !host.stdin.writable) {
    throw new Error("Host PayGo indisponivel");
  }
  host.stdin.write(JSON.stringify(obj) + "\n", "utf8");
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
  p.then(() => reconcilePendingAtStartup()).catch(() => {});
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
    pendingConfirmation: loadPendingConfirmation(),
    lastInitError: hostLastError,
    lastInitErrorAt: hostLastErrorAt || null,
    lastStderr: hostLastStderr || null,
    cooldownMs: HOST_FAIL_COOLDOWN_MS,
  };
}


// ---------- venda ----------
function methodToBridge(method) {
  const m = String(method || "").toUpperCase();
  if (!m || m === "AUTO") return "AUTO";
  if (m === "CREDITO" || m === "CRÉDITO" || m === "CREDIT") return "CREDITO";
  if (m === "DEBITO" || m === "DÉBITO" || m === "DEBIT") return "DEBITO";
  if (m === "PIX") return "PIX";
  if (m === "VOUCHER") return "VOUCHER";
  return "AUTO";
}

let currentSaleRequestId = null;
let currentSalePaymentId = null;
const saleEvents = new EventEmitter();

function emitSaleEvent(event) {
  try {
    saleEvents.emit("sale-event", { ...event, at: new Date().toISOString() });
  } catch {
    // nunca derruba fluxo de pagamento por erro de listener
  }
}

function onSaleEvent(listener) {
  saleEvents.on("sale-event", listener);
  return () => saleEvents.off("sale-event", listener);
}

async function efetuarPagamento(opts = {}) {
  const pending = loadPendingConfirmation();
  if (pending) {
    throw new Error("Existe transação pendente de confirmação. Resolva via /tef/confirm ou /tef/undo antes de iniciar uma nova venda.");
  }

  const valor = Number(opts.valor || 0);
  if (!valor || valor <= 0) throw new Error("valor obrigatório");
  const amountInCents = Math.round(valor * 100);
  const installments = Number(opts.parcelas || 1);
  const method = methodToBridge(opts.tipo);
  const paymentId = String(opts.paymentId || opts.saleId || `sale-${Date.now()}`);
  currentSalePaymentId = paymentId;
  const requestedNetwork = String(opts.paygoMenuChoice || opts.acquirer || opts.rede || "").trim().toUpperCase();
  const saleId = opts.saleId || `SALE-${Date.now()}`;
  const saleMeta = { amountCentavos: amountInCents, saleId };
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
    message: `Iniciando transação no PayGo (${saleId})...${requestedNetwork ? ` Rede solicitada: ${requestedNetwork}.` : ""}`,
    qrCode: "",
    startedAt: Date.now(),
    saleId,
    method,
    amount: valor,
    qrDisplayPreference,
    lastQrAt: 0,
    pendingCaptures: null,
    captureSeq: 0,
  });
  emitSaleEvent({ paymentId, type: "INFO", message: `Enviando transação ${saleId} ao PayGo TEF` });

  try {
    if (requestedNetwork) {
      try { console.log("[TEF] rede solicitada pelo frontend:", requestedNetwork); } catch {}
    }
    const payload = await runBridge({
      action: "sale",
      saleId,
      amountInCents,
      method,
      installments,
      paygoMenuChoice: requestedNetwork,
      captureValuesBase64: opts.captureValuesBase64 || "",
      qrDisplayPreference,
    }, {
      onRequestId: (id) => { currentSaleRequestId = id; },
      onEvent: (ev) => {
      if (!ev) return;
      // O bridge emite eventos NDJSON: { type, message }.
      // QRCODE traz o BR Code Pix em `message` (vindo de PWINFO_AUTHPOSQRCODE).
      if (ev.type === "QRCODE" && ev.message) {
        setSaleStatus({ qrCode: ev.message, lastQrAt: Date.now(), message: `Aguardando pagamento PIX da venda ${saleId}. Cliente, escaneie o QR Code no checkout/PC.` });
        emitSaleEvent({ paymentId, type: "QRCODE", message: ev.message });
      } else if (ev.type === "CAPTURE") {
        const cap = {
          identificador: Number(ev.identificador),
          tipo: Number(ev.tipo),
          prompt: String(ev.prompt || ""),
          options: Array.isArray(ev.options) ? ev.options : [],
          tamMin: Number(ev.tamMin || 0),
          tamMax: Number(ev.tamMax || 0),
          mascara: String(ev.mascara || ""),
          ocultar: !!ev.ocultar,
          seq: Number(ev.seq || 0),
          captureType: String(ev.captureType || ""),
        };
        setSaleStatus({
          status: "waiting_input",
          message: cap.prompt || "Aguardando entrada do operador",
          pendingCaptures: [cap],
          captureSeq: cap.seq,
        });
        emitSaleEvent({
          paymentId,
          type: "INPUT",
          message: cap.prompt || "Aguardando entrada do operador",
          interaction: {
            id: `${paymentId}:${cap.seq || Date.now()}`,
            kind: Array.isArray(cap.options) && cap.options.length > 0 ? "menu" : "input",
            title: "Interação PayGo",
            prompt: cap.prompt || "Informe o valor solicitado pela PayGo",
            identifier: String(cap.identificador),
            options: cap.options,
            inputType: cap.ocultar ? "password" : "text",
            minLength: cap.tamMin || 0,
            maxLength: cap.tamMax || 0,
            required: true,
          },
          capture: cap,
        });
      } else if (ev.message) {
        setSaleStatus({ message: ev.message });
        emitSaleEvent({ paymentId, type: ev.type === "PINPAD" ? "PINPAD" : "INFO", message: ev.message });
      }
      if (typeof opts.onDisplay === "function" && ev.message) opts.onDisplay(ev.message);
    }});

    if (payload?.status === "pendingConfirmation" || isPayGoPendingPayload(payload)) {
      return finishPendingSale(paymentId, payload, payload?.status === "pendingConfirmation" ? "pendingConfirmation" : "falha-comunicacao-pendente", saleMeta);
    }

    if (payload?.ok === false) {
      if (String(payload?.data?.cnfReq || "") === "1" && hasPayGoConfirmationTuple(payload?.data)) {
        return finishPendingSale(paymentId, payload, "cnfReq=1", saleMeta);
      }
      setSaleStatus({ status: "error", message: payload?.message || "Transação não aprovada" });
      emitSaleEvent({ paymentId, type: "DENIED", message: payload?.message || "Transação não aprovada", payload });
      return payload;
    }

    clearPendingConfirmation();
    setSaleStatus({ status: "done", message: payload?.message || payload?.status || "Concluído", pendingCaptures: null });
    emitSaleEvent({ paymentId, type: "APPROVED", message: payload?.message || "Transação aprovada", payload });
    return payload;
  } catch (err) {
    const pendingProbe = await probePendingTransaction();
    if (pendingProbe) {
      console.log("[TEF] Falha de comunicação com pendência PayGo detectada:", err.message);
      return finishPendingSale(paymentId, pendingProbe, "falha-comunicacao-host", saleMeta);
    }

    if (method === "PIX" && saleStatus.qrCode) {
      setSaleStatus({
        status: "timeout",
        message: `QR Code gerado para ${saleId}, mas o PayGo excedeu o tempo aguardando confirmação. Verifique se o Pix foi pago antes de cancelar ou repetir.`,
      });
    } else {
      setSaleStatus({ status: "error", message: err.message });
    }
    emitSaleEvent({ paymentId, type: "ERROR", message: err.message || "Falha na transação" });

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
  } finally {
    currentSaleRequestId = null;
    currentSalePaymentId = null;
  }
}

function respondSale(responses) {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error("responses obrigatório (array de { identificador, value })");
  }
  if (!currentSaleRequestId) {
    throw new Error("Nenhuma venda em andamento aguardando resposta");
  }
  const id = currentSaleRequestId;
  for (const r of responses) {
    writeHostLine({
      id,
      action: "capture_response",
      identificador: Number(r.identificador),
      value: String(r.value ?? ""),
    });
  }
  setSaleStatus({ pendingCaptures: null, message: "Resposta enviada, aguardando PayGo..." });
  emitSaleEvent({ type: "INFO", paymentId: String(currentSalePaymentId || saleStatus.saleId || "sale"), message: "Resposta de interação enviada ao PayGo" });
}

async function limparPendencia() {
  try {
    const r = await runBridge({ action: "cleanup" }, { timeoutMs: 15000 });
    clearPendingConfirmation();
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
  const confirmationJsonBase64 = resolveConfirmationJsonBase64(opts);
  if (!confirmationJsonBase64) {
    throw new Error("confirmationJsonBase64 obrigatório (token PGWEB:)");
  }
  const r = await runBridge({
    action: "undo",
    confirmationJsonBase64,
    undoReason: opts.undoReason || "",
  });
  if (r?.ok) {
    clearPendingConfirmation();
    return r;
  }
  const details = await getPendingDetails().catch(() => null);
  if (!details?.hasPending) {
    clearPendingConfirmation();
    return {
      ok: true,
      status: "resolvedNoPending",
      message: "PayGo não possui pendência ativa; pendência local antiga removida.",
      retorno: r,
    };
  }
  return r;
}

async function confirmarVenda(opts = {}) {
  const confirmationJsonBase64 = resolveConfirmationJsonBase64(opts);
  if (!confirmationJsonBase64) {
    throw new Error("confirmationJsonBase64 obrigatório (token PGWEB:)");
  }
  const r = await runBridge({
    action: "confirm",
    confirmationJsonBase64,
  });
  if (!r?.ok) {
    const details = await getPendingDetails().catch(() => null);
    if (!details?.hasPending) {
      clearPendingConfirmation();
      return {
        ok: true,
        status: "resolvedNoPending",
        message: "PayGo não possui pendência ativa; pendência local antiga removida.",
        retorno: r,
      };
    }
    throw new Error(r?.message || "Falha ao confirmar venda no PayGo");
  }
  clearPendingConfirmation();
  return r;
}

function cancelarEmAndamento() {
  // Mata o host atual — a próxima chamada respawn.
  stopHost("cancelarEmAndamento");
}

// ---------- ADM / instalação ----------
async function administrativoAsync(opts = {}) {
  if (currentAdminRequestId || admStatus.status === "running" || admStatus.status === "waiting_input") {
    return {
      ok: true,
      started: true,
      status: "running",
      message: "Operação administrativa já em andamento. Finalize a captura atual.",
    };
  }

  setAdmStatus({
    status: "running",
    message: "Iniciando operação administrativa...",
    startedAt: Date.now(),
    result: null,
    receipts: null,
    error: null,
    pendingCaptures: null,
    captureSeq: 0,
  });

  // Espelha a demo oficial Setis (Integracao-PayGoWeb-CSharp / MainWindow.xaml.cs):
  // ADMIN não recebe nenhum parâmetro de configuração — o bridge envia apenas os 5
  // params base (AUTNAME/AUTVER/AUTDEV/AUTCAP/DSPQRPREF). Tudo mais (cpfCnpj/PdC/
  // ambiente/pinpad) vem das env vars setadas pelo instalador do PayGo Windows.
  // Os PWDAT_MENU/TYPED/USERAUTH chegam interativamente como CAPTURE events e o
  // operador responde via /tef/admin/respond.
  const payload = { action: "admin" };

  try {
    const result = await runBridge(payload, {
      timeoutMs: opts.timeoutMs || 600000,
      onRequestId: (id) => { currentAdminRequestId = id; },
      onEvent: (ev) => {
        if (!ev) return;
        if (ev.type === "CAPTURE") {
          // ev tem { type:"CAPTURE", captureType, identificador, tipo, prompt, options, tamMin, tamMax, mascara, ocultar, aceitaNulo, seq }
          const cap = {
            identificador: Number(ev.identificador),
            tipo: Number(ev.tipo),
            prompt: String(ev.prompt || ""),
            options: Array.isArray(ev.options) ? ev.options : [],
            tamMin: Number(ev.tamMin || 0),
            tamMax: Number(ev.tamMax || 0),
            mascara: String(ev.mascara || ""),
            ocultar: !!ev.ocultar,
            valorInicial: String(ev.valorInicial || ""),
            seq: Number(ev.seq || 0),
          };
          setAdmStatus({
            status: "waiting_input",
            message: cap.prompt || "Aguardando entrada do operador",
            pendingCaptures: [cap],
            captureSeq: cap.seq,
          });
          return;
        }
        if (ev.message) setAdmStatus({ message: ev.message });
      },
    });
    const resultData = result && typeof result === "object" ? result.data : null;
    setAdmStatus({
      status: "done",
      message: result?.message || result?.status || "Concluído",
      result,
      receipts: resultData && typeof resultData === "object" ? resultData : null,
      pendingCaptures: null,
    });
    return result;
  } catch (err) {
    setAdmStatus({
      status: "error",
      message: err.message,
      error: err.message,
      receipts: null,
      pendingCaptures: null,
    });
    throw err;
  } finally {
    currentAdminRequestId = null;
  }
}

async function instalarPdc(opts = {}) {
  // DEPRECATED: a instalação oficial do PdC é feita pelo instalador do PayGo Windows
  // (modo DEMO) — ver /configuracoes/tef-paygo. Mantido só por compatibilidade da
  // rota /tef/install; não usar em UI nova.
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
  // tenta sinalizar abort ao bridge antes de derrubar o host
  if (currentAdminRequestId) {
    try { writeHostLine({ id: currentAdminRequestId, action: "abort_capture" }); } catch { /* ignore */ }
  }
  setAdmStatus({ status: "aborted", message: "Operação abortada", receipts: null, pendingCaptures: null });
  stopHost("abortAdm");
  currentAdminRequestId = null;
}

function respondAdm(responses) {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error("responses obrigatório (array de { identificador, value })");
  }
  if (!currentAdminRequestId) {
    throw new Error("Nenhum admin em andamento aguardando resposta");
  }
  const id = currentAdminRequestId;
  for (const r of responses) {
    writeHostLine({
      id,
      action: "capture_response",
      identificador: Number(r.identificador),
      value: String(r.value ?? ""),
    });
  }
  setAdmStatus({ pendingCaptures: null, message: "Resposta enviada, aguardando PayGo..." });
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
  respondSale,
  onSaleEvent,
  abortAdm,
  respondAdm,
  instalarPdc,
  getPendingConfirmation: loadPendingConfirmation,
  getPendingDetails,
  clearPendingConfirmation,
  probePendingTransaction,
  finalizar,
  // exports usados em testes/diagnóstico
  _NEXA_DEFAULTS: NEXA_DEFAULTS,
  _findDllPath: findDllPath,
};
