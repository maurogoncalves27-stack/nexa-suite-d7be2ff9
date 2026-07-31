// ============================================================
// Payer Checkout — Adapter API Localhost (:6060)
// https://docs.payer.com.br/docs/integrations/api-localhost.html
// Módulo isolado — não depende de PayGo / PGWebLib.
// ============================================================

const FINAL_STATUSES = new Set(["APPROVED", "REJECTED", "ABORTED"]);

let loggedIn = false;
let lastError = null;
let lastResponse = null;

function baseUrl() {
  return (process.env.PAYER_BASE_URL || "http://127.0.0.1:6060").replace(/\/$/, "");
}

function credentials(overrides = {}) {
  return {
    email: overrides.email || process.env.PAYER_EMAIL || "",
    password: overrides.password || process.env.PAYER_PASSWORD || "",
  };
}

async function payerFetch(path, options = {}) {
  const url = `${baseUrl()}${path}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const init = { ...options, headers };
  if (init.body && typeof init.body !== "string") {
    init.body = JSON.stringify(init.body);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    lastError = e.message || String(e);
    throw new Error(`Checkout Payer indisponível em ${baseUrl()}: ${lastError}`);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
    lastError = msg;
    throw new Error(msg);
  }

  lastError = null;
  return data;
}

async function isLoggedIn() {
  try {
    const data = await payerFetch("/Client/login", { method: "GET" });
    loggedIn = !!(
      data?.loggedIn ??
      data?.isLoggedIn ??
      data?.authenticated ??
      String(data?.status ?? "").toUpperCase() === "ACTIVE"
    );
    return loggedIn;
  } catch (e) {
    loggedIn = false;
    lastError = e.message;
    return false;
  }
}

async function login(overrides = {}) {
  const { email, password } = credentials(overrides);
  if (!email || !password) {
    throw new Error("PAYER_EMAIL e PAYER_PASSWORD são obrigatórios (env ou body)");
  }
  const data = await payerFetch("/Client/login", {
    method: "POST",
    body: { email, password },
  });
  loggedIn = true;
  return data;
}

async function ensureLogin(overrides = {}) {
  if (await isLoggedIn()) return { ok: true, alreadyLoggedIn: true };
  return login(overrides);
}

async function logoff() {
  try {
    await payerFetch("/Client/logoff", { method: "POST", body: {} });
  } finally {
    loggedIn = false;
  }
  return { ok: true };
}

async function requestPayment(payload) {
  await ensureLogin(payload);
  const body = { ...payload };
  delete body.email;
  delete body.password;
  delete body.wait;
  delete body.pollIntervalMs;
  delete body.timeoutMs;

  if (!body.command) body.command = "PAYMENT";
  if (body.command === "PAYMENT" && (body.value == null || body.value === "")) {
    throw new Error("value obrigatório para PAYMENT");
  }

  const data = await payerFetch("/Client/request", { method: "POST", body });
  lastResponse = data;
  return data;
}

async function getResponse() {
  const data = await payerFetch("/Client/response", { method: "GET" });
  lastResponse = data;
  return data;
}

async function pollResponse(opts = {}) {
  const intervalMs = Math.max(250, Math.min(500, Number(opts.pollIntervalMs) || 400));
  const timeoutMs = Number(opts.timeoutMs) || 600000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const data = await getResponse();
    const status = data?.statusTransaction;
    if (status && FINAL_STATUSES.has(String(status))) {
      return data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Timeout aguardando resposta do Checkout Payer (${timeoutMs}ms)`);
}

async function requestPaymentAndWait(payload) {
  await requestPayment(payload);
  return pollResponse(payload);
}

async function abort() {
  await ensureLogin();
  const data = await payerFetch("/Client/request/abort", {
    method: "POST",
    body: { command: "ABORT" },
  });
  return data;
}

async function diagnostics() {
  const { email } = credentials();
  const info = {
    baseUrl: baseUrl(),
    hasCredentials: !!(email && process.env.PAYER_PASSWORD),
    loggedIn: false,
    checkoutReachable: false,
    lastError,
    lastResponse,
  };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${baseUrl()}/Client/login`, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    info.checkoutReachable = res.ok || res.status === 401 || res.status === 403;
  } catch (e) {
    info.lastError = e.message || String(e);
    return info;
  }

  try {
    info.loggedIn = await isLoggedIn();
  } catch (e) {
    info.lastError = e.message;
  }

  return info;
}

function isAvailable() {
  return true;
}

function getLastResponse() {
  return lastResponse;
}

module.exports = {
  isAvailable,
  baseUrl,
  login,
  logoff,
  isLoggedIn,
  ensureLogin,
  requestPayment,
  getResponse,
  pollResponse,
  requestPaymentAndWait,
  abort,
  diagnostics,
  getLastResponse,
};
