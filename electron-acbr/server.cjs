// ============================================================
// Servidor local — HTTP (3030) + HTTPS (3031)
// ============================================================
// HTTPS é OBRIGATÓRIO para chamadas vindas do app em produção
// (a UI roda em https://*.lovable.app e o Chrome bloqueia
// mixed-content para http://localhost).
//
// Na primeira execução o agente:
//   1) gera um certificado auto-assinado (CN=localhost, SAN=127.0.0.1)
//   2) salva em %APPDATA%\nexa-acbr-agent\certs\
//   3) tenta importar para o "Trusted Root" do usuário atual via
//      `certutil -user -addstore -f Root <cert.pem>` (silencioso)
//
// Endpoints idênticos nos dois transportes.
// ============================================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const nfe = require("./acbr-nfe.cjs");
const tef = require("./acbr-tefd.cjs");
const payer = require("./payer/localhost.cjs");
const { handlePayerRoutes } = require("./payer/routes.cjs");
const pkg = require("./package.json");

const HTTP_PORT = parseInt(process.env.ACBR_AGENT_PORT || "3030", 10);
const HTTPS_PORT = parseInt(process.env.ACBR_AGENT_HTTPS_PORT || "3031", 10);

// ---------- Orquestração estilo referência (etapa 1) ----------
const paymentStore = new Map();
const tefEventHistory = [];
const sseClients = new Set();
let paymentCounter = 0;
let paymentQueue = Promise.resolve();
const MAX_EVENT_HISTORY = 400;

function queuePaymentRun(task) {
  const run = () => task().catch((err) => { throw err; });
  const next = paymentQueue.then(run, run);
  paymentQueue = next.catch(() => undefined);
  return next;
}

function undoReasonFor(payment, body = {}) {
  if (payment?.status === "APROVADA_NAO_CONFIRMADA" && Number(payment?.amountInCents) === 101300) {
    return "dispensingFailure";
  }
  return String(body?.undoReason || "").trim();
}

function paygoOutcomeMessage(retorno, fallback) {
  const msg = String(retorno?.message || "").trim();
  if (!msg || msg === "PW_iConfirmation OK") return fallback;
  return msg;
}

function requiresManualConfirmation(body) {
  // Só o checkbox do operador controla confirmação manual na UI.
  // CNFREQ=1 no sandbox PayGo não deve abrir modal quando o checkbox está desmarcado.
  return !!body?.manualConfirmation;
}

function paygoTupleFromData(data) {
  if (!data?.reqNum) return null;
  return {
    reqNum: data?.reqNum || "",
    locRef: data?.locRef || "",
    extRef: data?.extRef || "",
    virtMerch: data?.virtMerch || "",
    authSyst: data?.authSyst || data?.acquirer || "",
  };
}

function isPayGoPendingRetorno(retorno) {
  return retorno?.status === "pendingConfirmation" || Number(retorno?.ret) === -2599;
}

function applyPendingConfirmation(paymentId, retorno) {
  const data = retorno?.data || {};
  const paygoTuple = paygoTupleFromData(data);
  updatePayment(paymentId, {
    status: "PENDENTE_CONFIRMACAO",
    message: retorno?.message || "Pendência PayGo",
    nsu: data?.reqNum || data?.extRef || null,
    authorizationCode: data?.authCode || null,
    brand: data?.brand || null,
    acquirer: data?.acquirer || data?.authSyst || null,
    customerReceipt: data?.customerReceipt || null,
    merchantReceipt: data?.merchantReceipt || null,
    paygo: paygoTuple,
  });
  publishTefEvent({
    paymentId,
    type: "PENDING",
    message: retorno?.message || "PayGo informou transação pendente de confirmação",
  });
  return paymentStore.get(paymentId);
}

function storedPendingConfirmationRetorno() {
  if (typeof tef.getPendingConfirmation !== "function") return null;
  const stored = tef.getPendingConfirmation();
  if (!stored?.reqNum) return null;
  return {
    status: "pendingConfirmation",
    ok: false,
    message: "Existe transação pendente de confirmação no PayGo. Confirme ou desfaça antes de iniciar nova venda.",
    data: stored,
  };
}

function createPaymentRecord(body) {
  const now = new Date().toISOString();
  const id = `${Date.now()}-${++paymentCounter}`;
  return {
    id,
    saleId: String(body?.saleId || "").trim(),
    amountInCents: Number(body?.amountInCents || 0),
    method: body?.method || null,
    installments: body?.installments || 1,
    paygoMenuChoice: body?.paygoMenuChoice || null,
    captureValues: body?.captureValues || null,
    status: "CRIADA",
    message: "",
    nsu: null,
    authorizationCode: null,
    brand: null,
    acquirer: null,
    customerReceipt: null,
    merchantReceipt: null,
    paygo: null,
    interaction: null,
    createdAt: now,
    updatedAt: now,
  };
}

function savePayment(payment) {
  payment.updatedAt = new Date().toISOString();
  paymentStore.set(payment.id, payment);
  return payment;
}

function updatePayment(paymentId, patch) {
  const row = paymentStore.get(paymentId);
  if (!row) return null;
  Object.assign(row, patch || {});
  row.updatedAt = new Date().toISOString();
  paymentStore.set(paymentId, row);
  return row;
}

function publishTefEvent(event) {
  if (!event || !event.paymentId) return;
  const payload = {
    paymentId: String(event.paymentId),
    type: event.type || "INFO",
    message: event.message || "",
    at: event.at || new Date().toISOString(),
    interaction: event.interaction || null,
  };
  tefEventHistory.push(payload);
  if (tefEventHistory.length > MAX_EVENT_HISTORY) tefEventHistory.shift();
  if (payload.interaction) {
    updatePayment(payload.paymentId, { interaction: payload.interaction });
  }
  for (const client of sseClients) {
    try { client.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* ignore */ }
  }
}

if (typeof tef.onSaleEvent === "function") {
  tef.onSaleEvent((event) => publishTefEvent(event));
}

// ---------- certificado auto-assinado ----------
function certDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const dir = path.join(base, "nexa-acbr-agent", "certs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadOrCreateCert() {
  const dir = certDir();
  const certPath = path.join(dir, "agent.pem");
  const keyPath = path.join(dir, "agent.key");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      certPath,
      keyPath,
      generated: false,
    };
  }

  console.log("[NEXA ACBr Agent] Gerando certificado auto-assinado em", dir);
  let selfsigned;
  try {
    selfsigned = require("selfsigned");
  } catch (e) {
    console.error("[NEXA ACBr Agent] Pacote 'selfsigned' não instalado. HTTPS desabilitado.");
    return null;
  }

  const attrs = [{ name: "commonName", value: "localhost" }];
  const extensions = [
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
      ],
    },
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
      keyCertSign: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
    },
  ];
  const pems = selfsigned.generate(attrs, {
    algorithm: "sha256",
    days: 3650,
    keySize: 2048,
    extensions,
  });

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);

  // Tenta importar para o Trusted Root do usuário (não exige admin).
  try {
    const r = spawnSync("certutil", ["-user", "-addstore", "-f", "Root", certPath], {
      windowsHide: true,
    });
    if (r.status === 0) {
      console.log("[NEXA ACBr Agent] Certificado importado no Trusted Root do usuário.");
    } else {
      console.warn(
        "[NEXA ACBr Agent] Não foi possível importar o certificado automaticamente. " +
          "Importe manualmente: " + certPath
      );
    }
  } catch (e) {
    console.warn("[NEXA ACBr Agent] certutil indisponível:", e.message);
  }

  return {
    cert: pems.cert,
    key: pems.private,
    certPath,
    keyPath,
    generated: true,
  };
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Private-Network": "true",
    ...headers,
  });
  res.end(json);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");

  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  try {
    // -------- health --------
    if (req.method === "GET" && path === "/health") {
      let nfceReady = false, nfceVersion = null, nfceError = null;
      try { nfceVersion = nfe.versao(); nfceReady = true; }
      catch (e) { nfceError = e.message; }
      const nfceDiagnostics = nfe.diagnostics();

      let tefReady = false, tefVersion = null, tefError = null;
      const tefAvailable = tef.isAvailable();
      if (tefAvailable) {
        // Auto-inicializa a PGWebLib na primeira chamada de /health para que
        // a checagem de saúde reflita tefReady=true sem exigir clique manual.
        try { tef.ensureInit(); }
        catch (e) { tefError = e.message; }
        const d = tef.diagnostics();
        tefReady = !!d.initialized;
        tefVersion = tefReady ? "PGWebLib inicializada" : "PGWebLib carregada";
      } else {
        tefError = "PGWebLib.dll não disponível";
      }
      const tefDiagnostics = tef.diagnostics();

      return send(res, 200, {
        ok: true,
        agent: pkg.name,
        version: pkg.version,
        nfceReady,
        nfceVersion,
        nfceError,
        nfceDiagnostics,
        tefAvailable,
        tefReady,
        tefVersion,
        tefError,
        tefDiagnostics,
        paths: nfe.paths,
      });
    }

    // -------- API (modelo referência - etapa 1) --------
    if (req.method === "GET" && path === "/api/events/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");
      sseClients.add(res);
      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.method === "GET" && path === "/api/events") {
      const paymentId = url.searchParams.get("paymentId");
      const events = paymentId
        ? tefEventHistory.filter((event) => event.paymentId === paymentId)
        : tefEventHistory.slice(-120);
      return send(res, 200, events);
    }

    if (req.method === "GET" && path === "/api/payments") {
      const list = Array.from(paymentStore.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return send(res, 200, list);
    }

    if (req.method === "GET" && path === "/api/tef/pending") {
      if (typeof tef.ensureInit === "function") {
        try { await tef.ensureInit(); } catch { /* segue com arquivo local */ }
      }
      if (typeof tef.getPendingDetails === "function") {
        const details = await tef.getPendingDetails();
        return send(res, 200, {
          ok: true,
          hasPending: !!details?.hasPending,
          pending: details?.pending || null,
          probe: details?.probe || null,
          tuple: details?.tuple || null,
          amountInCents: details?.amountCentavos || null,
          saleId: details?.saleId || null,
          reqNum: details?.tuple?.reqNum || null,
          reason: details?.reason || null,
          brand: details?.brand || null,
          authCode: details?.authCode || null,
          merchantReceipt: details?.merchantReceipt || null,
          customerReceipt: details?.customerReceipt || null,
          probeStatus: details?.probeStatus || null,
        });
      }
      const stored = typeof tef.getPendingConfirmation === "function" ? tef.getPendingConfirmation() : null;
      return send(res, 200, {
        ok: true,
        hasPending: !!stored?.reqNum,
        pending: stored,
        probe: null,
        amountInCents: stored?.amountCentavos || null,
        saleId: stored?.saleId || null,
        reqNum: stored?.reqNum || null,
        reason: stored?.reason || null,
      });
    }

    if (req.method === "GET" && /^\/api\/payments\/[^/]+$/.test(path)) {
      const paymentId = path.split("/").at(-1);
      const payment = paymentStore.get(paymentId);
      if (!payment) return send(res, 404, { ok: false, error: "Pagamento não encontrado" });
      return send(res, 200, payment);
    }

    if (req.method === "POST" && path === "/api/payments") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req).catch(() => ({}));
      const amountInCents = Number(body?.amountInCents || 0);
      const saleId = String(body?.saleId || "").trim();
      if (!saleId) return send(res, 400, { ok: false, error: "saleId obrigatório" });
      if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
        return send(res, 400, { ok: false, error: "amountInCents obrigatório (>0)" });
      }

      const payment = savePayment(createPaymentRecord(body));
      publishTefEvent({ paymentId: payment.id, type: "INFO", message: "Pagamento criado" });

      const blockedPending = storedPendingConfirmationRetorno();
      if (blockedPending) {
        const finalized = applyPendingConfirmation(payment.id, blockedPending);
        return send(res, 409, finalized);
      }

      const mapMethod = (method) => {
        const m = String(method || "").toUpperCase();
        if (m === "DEBITO" || m === "DEBIT") return "debito";
        if (m === "CREDITO" || m === "CREDIT") return "credito";
        if (m === "PIX_TEF" || m === "PIX") return "pix";
        return "auto";
      };

      try {
        const finalized = await queuePaymentRun(async () => {
          updatePayment(payment.id, { status: "ENVIADA_AO_TEF", message: "Enviando transação ao PayGo TEF" });
          publishTefEvent({ paymentId: payment.id, type: "INFO", message: "Enviando transação ao PayGo TEF" });
          const retorno = await tef.efetuarPagamento({
            paymentId: payment.id,
            valor: amountInCents / 100,
            saleId,
            tipo: mapMethod(body?.method),
            parcelas: Number(body?.installments || 1),
            paygoMenuChoice: body?.paygoMenuChoice || "",
            captureValues: body?.captureValues || {},
            onDisplay: (message) => {
              if (message) publishTefEvent({ paymentId: payment.id, type: "PINPAD", message: String(message) });
            },
          });

          const data = retorno?.data || {};
          const paygoTuple = paygoTupleFromData(data);

          if (isPayGoPendingRetorno(retorno)) {
            return applyPendingConfirmation(payment.id, retorno);
          }

          if (retorno?.ok === false) {
            const msg = retorno?.message || "Falha na transação";
            const upper = String(msg).toUpperCase();
            const status = upper.includes("NEGADA") || upper.includes("INVALIDA") ? "NEGADA" : "ERRO_COMUNICACAO";
            updatePayment(payment.id, { status, message: msg, paygo: paygoTuple });
            publishTefEvent({ paymentId: payment.id, type: "DENIED", message: msg });
            return paymentStore.get(payment.id);
          }

          // Fluxo alinhado com paygo-tef-pinpad-demo / PayGoTefService:
          // venda aprovada fica APROVADA_NAO_CONFIRMADA; confirma/desfaz via API.
          const manualConfirmation = requiresManualConfirmation(body);
          updatePayment(payment.id, {
            status: "APROVADA_NAO_CONFIRMADA",
            message: retorno?.message || "Transação aprovada",
            nsu: data?.reqNum || data?.extRef || null,
            authorizationCode: data?.authCode || null,
            brand: data?.brand || null,
            acquirer: data?.acquirer || data?.authSyst || null,
            customerReceipt: data?.customerReceipt || null,
            merchantReceipt: data?.merchantReceipt || null,
            paygo: paygoTuple,
          });
          publishTefEvent({ paymentId: payment.id, type: "APPROVED", message: "Aprovada. Salvando venda antes de confirmar." });

          if (manualConfirmation) {
            publishTefEvent({
              paymentId: payment.id,
              type: "INFO",
              message: "PayGo solicitou confirmacao manual da venda",
            });
            return paymentStore.get(payment.id);
          }

          if (!paygoTuple?.reqNum) {
            return paymentStore.get(payment.id);
          }

          try {
            const confirmationJsonBase64 = Buffer.from(JSON.stringify(paygoTuple), "utf8").toString("base64");
            const confirmRet = await tef.confirmarVenda({ confirmationJsonBase64 });
            if (confirmRet?.ok === false) {
              throw new Error(confirmRet?.message || "Falha ao confirmar venda no PayGo");
            }
            updatePayment(payment.id, {
              status: "CONFIRMADA",
              message: confirmRet?.message || "Venda confirmada no PayGo",
            });
            publishTefEvent({ paymentId: payment.id, type: "CONFIRMED", message: confirmRet?.message || "Venda confirmada no PayGo" });
          } catch (confirmErr) {
            try {
              await tef.cancelarVenda({ confirmationJsonBase64: Buffer.from(JSON.stringify(paygoTuple), "utf8").toString("base64") });
              publishTefEvent({ paymentId: payment.id, type: "UNDONE", message: "Falha ao finalizar venda. Transacao desfeita." });
              updatePayment(payment.id, {
                status: "DESFEITA",
                message: confirmErr?.message || "Falha ao confirmar venda",
              });
            } catch {
              throw confirmErr;
            }
          }
          return paymentStore.get(payment.id);
        });
        return send(res, 201, finalized);
      } catch (e) {
        const blockedPending = storedPendingConfirmationRetorno();
        if (blockedPending) {
          const finalized = applyPendingConfirmation(payment.id, blockedPending);
          return send(res, 409, finalized);
        }
        try {
          if (typeof tef.probePendingTransaction === "function") {
            const pendingProbe = await tef.probePendingTransaction();
            if (pendingProbe?.status === "pendingConfirmation") {
              const finalized = applyPendingConfirmation(payment.id, pendingProbe);
              return send(res, 201, finalized);
            }
          }
        } catch {
          // segue para erro de comunicação genérico
        }
        updatePayment(payment.id, { status: "ERRO_COMUNICACAO", message: e.message || "Falha de comunicação TEF" });
        publishTefEvent({ paymentId: payment.id, type: "ERROR", message: e.message || "Falha de comunicação TEF" });
        return send(res, 500, paymentStore.get(payment.id));
      }
    }

    if (req.method === "POST" && path === "/api/interactions/respond") {
      const body = await readBody(req).catch(() => ({}));
      try {
        let responses = Array.isArray(body?.responses) ? body.responses : [];
        if (!responses.length) {
          const interactionId = String(body?.interactionId || "");
          const paymentIdFromInteraction = interactionId.includes(":") ? interactionId.split(":")[0] : "";
          const payment = paymentStore.get(paymentIdFromInteraction);
          const identifier = Number(
            body?.identificador ??
            payment?.interaction?.identifier ??
            0
          );
          responses = [{ identificador: identifier, value: String(body?.value ?? "") }];
        }
        tef.respondSale(responses);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && /^\/api\/payments\/[^/]+\/confirm$/.test(path)) {
      const paymentId = path.split("/")[3];
      const payment = paymentStore.get(paymentId);
      if (!payment) return send(res, 404, { ok: false, error: "Pagamento não encontrado" });
      const tuple = payment.paygo;
      if (!tuple?.reqNum) return send(res, 400, { ok: false, error: "Pagamento sem token de confirmação" });
      try {
        const isPending = payment.status === "PENDENTE_CONFIRMACAO";
        publishTefEvent({
          paymentId,
          type: "INFO",
          message: isPending ? "Confirmando pendencia no PayGo" : "Confirmando venda no PayGo",
        });
        const confirmationJsonBase64 = Buffer.from(JSON.stringify(tuple), "utf8").toString("base64");
        const retorno = await tef.confirmarVenda({ confirmationJsonBase64 });
        updatePayment(paymentId, {
          status: "CONFIRMADA",
          message: paygoOutcomeMessage(retorno, isPending ? "Pendencia confirmada no PayGo" : "Venda confirmada no PayGo"),
        });
        publishTefEvent({
          paymentId,
          type: "CONFIRMED",
          message: paygoOutcomeMessage(retorno, isPending ? "Pendencia confirmada no PayGo" : "Venda confirmada no PayGo"),
        });
        return send(res, 200, paymentStore.get(paymentId));
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && /^\/api\/payments\/[^/]+\/undo$/.test(path)) {
      const paymentId = path.split("/")[3];
      const payment = paymentStore.get(paymentId);
      if (!payment) return send(res, 404, { ok: false, error: "Pagamento não encontrado" });
      const tuple = payment.paygo;
      if (!tuple?.reqNum) return send(res, 400, { ok: false, error: "Pagamento sem token de confirmação" });
      try {
        const body = await readBody(req).catch(() => ({}));
        const isPending = payment.status === "PENDENTE_CONFIRMACAO";
        publishTefEvent({
          paymentId,
          type: "INFO",
          message: isPending ? "Desfazendo pendencia no PayGo" : "Desfazendo venda no PayGo",
        });
        const confirmationJsonBase64 = Buffer.from(JSON.stringify(tuple), "utf8").toString("base64");
        const retorno = await tef.cancelarVenda({
          confirmationJsonBase64,
          undoReason: undoReasonFor(payment, body),
        });
        updatePayment(paymentId, {
          status: "DESFEITA",
          message: paygoOutcomeMessage(retorno, isPending ? "Pendencia desfeita no PayGo" : "Venda desfeita no PayGo"),
        });
        publishTefEvent({
          paymentId,
          type: "UNDONE",
          message: paygoOutcomeMessage(retorno, isPending ? "Pendencia desfeita no PayGo" : "Venda desfeita no PayGo"),
        });
        return send(res, 200, paymentStore.get(paymentId));
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    // -------- NFC-e --------
    if (req.method === "GET" && path === "/nfce/status") {
      const xml = nfe.statusServico();
      return send(res, 200, { ok: true, retorno: xml });
    }

    if (req.method === "POST" && path === "/nfce/emitir") {
      const body = await readBody(req);
      if (!body.iniContent) return send(res, 400, { ok: false, error: "iniContent obrigatório" });
      const retorno = nfe.emitirNFCe(body.iniContent, { imprimir: !!body.imprimir, sincrono: body.sincrono !== false });
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && path === "/nfce/cancelar") {
      const body = await readBody(req);
      const retorno = nfe.cancelarNFe(body);
      return send(res, 200, { ok: true, retorno });
    }

    // -------- TEF (PayGo Integrado / PGWebLib.dll) --------
    if (req.method === "POST" && path === "/tef/init") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req).catch(() => ({}));
      try {
        tef.ensureInit({ environment: body?.environment });
        const version = tef.versao();
        return send(res, 200, { ok: true, retorno: { initialized: true, version } });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/iniciar") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      if (!body.valor || body.valor <= 0) return send(res, 400, { ok: false, error: "valor obrigatório" });
      try {
        if (typeof tef.clearSaleStatus === "function") tef.clearSaleStatus();
        const retorno = await tef.efetuarPagamento({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
        if (retorno?.status === "pendingConfirmation") {
          return send(res, 409, {
            ok: false,
            retorno,
            error: retorno?.message || "Transação pendente de confirmação.",
            requiresAction: "confirm_or_undo",
          });
        }
        if (retorno?.ok === false) {
          return send(res, 502, { ok: false, retorno, error: retorno?.message || "Falha na transação TEF" });
        }
        return send(res, 200, { ok: true, retorno });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "GET" && path === "/tef/sale/status") {
      if (typeof tef.getSaleStatus !== "function") {
        return send(res, 200, { ok: true, status: "idle", message: "", qrCode: "" });
      }
      return send(res, 200, { ok: true, ...tef.getSaleStatus() });
    }

    if (req.method === "POST" && path === "/tef/sale/respond") {
      const body = await readBody(req).catch(() => ({}));
      try {
        tef.respondSale(body?.responses || []);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/cancelar") {
      tef.cancelarEmAndamento();
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/tef/limpar-pendencia") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      try {
        const retorno = await tef.limparPendencia();
        return send(res, 200, { ok: !!retorno?.ok, retorno, message: retorno?.message });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/cancelar-venda") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      try {
        const retorno = await tef.cancelarVenda({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
        return send(res, 200, { ok: true, retorno });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && (path === "/tef/confirm" || path === "/tef/undo")) {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll nÃ£o disponÃ­vel" });
      const body = await readBody(req).catch(() => ({}));
      let confirmationJsonBase64 = body?.confirmationJsonBase64;
      if (!confirmationJsonBase64) {
        const hasExplicitTuple = body?.reqNum || body?.locRef || body?.extRef || body?.virtMerch || body?.authSyst;
        if (hasExplicitTuple) {
          confirmationJsonBase64 = Buffer.from(JSON.stringify({
            reqNum: body?.reqNum || "",
            locRef: body?.locRef || "",
            extRef: body?.extRef || "",
            virtMerch: body?.virtMerch || "",
            authSyst: body?.authSyst || "",
          }), "utf8").toString("base64");
        }
      }
      try {
        const retorno = path === "/tef/confirm"
          ? await tef.confirmarVenda({ confirmationJsonBase64 })
          : await tef.cancelarVenda({ confirmationJsonBase64, undoReason: body?.undoReason || "" });
        return send(res, 200, { ok: !!retorno?.ok, retorno, message: retorno?.message });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/admin") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req).catch(() => ({}));
      // Fire-and-forget — pinpad é interativo; não bloqueia HTTP.
      tef.administrativoAsync({
        timeoutMs: 600000, // 10 min — alinhado com a demo Setis (PAYGO_TRANSACTION_TIMEOUT_MS)
        technicalPassword: body?.technicalPassword,
        pinpadPort: body?.pinpadPort,
        merchantCode: body?.merchantCode,
        terminalCode: body?.terminalCode,
        host: body?.host,
        paygoMenuChoice: body?.paygoMenuChoice,
      })
        .then((r) => console.log("[TEF admin] concluído:", r?.message ?? r?.status))
        .catch((e) => console.warn("[TEF admin] erro:", e.message));
      return send(res, 202, { ok: true, started: true, message: "Menu aberto no pinpad. Finalize na tela do dispositivo." });
    }

    if (req.method === "GET" && path === "/tef/admin/status") {
      return send(res, 200, { ok: true, ...tef.getAdmStatus() });
    }

    if (req.method === "POST" && path === "/tef/admin/abort") {
      tef.abortAdm();
      return send(res, 200, { ok: true, aborted: true });
    }

    if (req.method === "POST" && path === "/tef/admin/respond") {
      const body = await readBody(req).catch(() => ({}));
      try {
        tef.respondAdm(body?.responses || []);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
    }


    if (req.method === "POST" && (path === "/tef/install" || path === "/tef/instalar")) {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      const retorno = tef.instalarPdc({ ...body, environment: body.environment, onDisplay: (m) => console.log("[TEF display]", m) });
      return send(res, 200, { ok: true, retorno });
    }

    // -------- Payer (Checkout API Localhost :6060) — módulo isolado --------
    if (await handlePayerRoutes({ req, res, path, payer, readBody, send })) return;

    // -------- Teste isolado de porta COM do pinpad --------
    // Não depende de PGWebLib/PdC/host. Tenta abrir \\.\COMn diretamente.
    // Útil pra confirmar se a porta existe, se o pinpad está conectado e se
    // outro processo (PayGo Windows) está segurando o handle.
    if (req.method === "POST" && path === "/tef/pinpad/test") {
      const body = await readBody(req).catch(() => ({}));
      const portNum = String(body?.port ?? body?.com ?? "5").replace(/\D/g, "") || "5";
      const devicePath = `\\\\.\\COM${portNum}`;
      const fs = require("fs");
      let fd = null;
      try {
        // 'r+' = leitura+escrita exclusiva; no Windows abre o device serial.
        fd = fs.openSync(devicePath, "r+");
        return send(res, 200, {
          ok: true,
          port: `COM${portNum}`,
          devicePath,
          accessible: true,
          locked: false,
          message: `COM${portNum} aberta com sucesso — pinpad acessível e porta livre.`,
        });
      } catch (e) {
        const code = e && e.code;
        const errno = e && e.errno;
        let diagnosis;
        if (code === "ENOENT") {
          diagnosis = `COM${portNum} NÃO existe no Windows. Confirme no Gerenciador de Dispositivos qual porta o pinpad recebeu.`;
        } else if (code === "EBUSY" || code === "EACCES" || code === "EPERM") {
          diagnosis = `COM${portNum} existe mas está EM USO por outro processo (provavelmente o PayGo Windows com o serviço segurando o pinpad). Feche o PayGo Windows e tente de novo.`;
        } else {
          diagnosis = `Falha ao abrir COM${portNum}: ${e.message}`;
        }
        return send(res, 200, {
          ok: false,
          port: `COM${portNum}`,
          devicePath,
          accessible: code !== "ENOENT",
          locked: code === "EBUSY" || code === "EACCES" || code === "EPERM",
          error: { code, errno, message: e.message },
          message: diagnosis,
        });
      } finally {
        if (fd != null) {
          try { fs.closeSync(fd); } catch { /* ignore */ }
        }
      }
    }


    return send(res, 404, { ok: false, error: "Rota não encontrada", path });
  } catch (e) {
    console.error("[ACBr Agent] erro:", e);
    return send(res, 500, { ok: false, error: e.message });
  }
}

function start() {
  // HTTP (compatibilidade com Electron local)
  const httpServer = http.createServer(handle);
  httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
    console.log(`[NEXA ACBr Agent] v${pkg.version} HTTP  em http://127.0.0.1:${HTTP_PORT}`);
    console.log(`[NEXA ACBr Agent] ACBR_BASE = ${nfe.paths.ACBR_BASE}`);
  });
  httpServer.on("error", (e) => {
    console.error("[NEXA ACBr Agent] erro HTTP:", e);
    if (e.code === "EADDRINUSE") console.error(`Porta ${HTTP_PORT} já em uso.`);
  });

  // HTTPS (para chamadas vindas de páginas https://*)
  let httpsServer = null;
  const certInfo = loadOrCreateCert();
  if (certInfo) {
    try {
      httpsServer = https.createServer({ cert: certInfo.cert, key: certInfo.key }, handle);
      httpsServer.listen(HTTPS_PORT, "127.0.0.1", () => {
        console.log(`[NEXA ACBr Agent] v${pkg.version} HTTPS em https://127.0.0.1:${HTTPS_PORT}`);
        console.log(`[NEXA ACBr Agent] cert: ${certInfo.certPath}`);
      });
      httpsServer.on("error", (e) => {
        console.error("[NEXA ACBr Agent] erro HTTPS:", e);
        if (e.code === "EADDRINUSE") console.error(`Porta ${HTTPS_PORT} já em uso.`);
      });
    } catch (e) {
      console.error("[NEXA ACBr Agent] falha ao iniciar HTTPS:", e.message);
    }
  } else {
    console.warn("[NEXA ACBr Agent] HTTPS desabilitado (sem certificado).");
  }

  return { httpServer, httpsServer };
}

function stop() {
  try { nfe.finalizar(); } catch { /* ignore */ }
  try { tef.finalizar(); } catch { /* ignore */ }
}

if (require.main === module) {
  const servers = start();

  const shutdown = () => {
    stop();
    try { servers.httpServer?.close(); } catch { /* ignore */ }
    try { servers.httpsServer?.close(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 200);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { start, stop, HTTP_PORT, HTTPS_PORT };
