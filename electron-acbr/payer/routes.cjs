// Rotas HTTP /payer/* — isoladas do módulo PayGo (acbr-tefd.cjs).

/**
 * @param {{ req: import('http').IncomingMessage, res: import('http').ServerResponse, path: string, payer: object, readBody: Function, send: Function }} ctx
 * @returns {Promise<boolean>} true se a rota foi tratada
 */
async function handlePayerRoutes({ req, res, path, payer, readBody, send }) {
  if (req.method === "GET" && path === "/payer/diagnostics") {
    try {
      const d = await payer.diagnostics();
      send(res, 200, { ok: true, ...d });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && path === "/payer/login") {
    const body = await readBody(req).catch(() => ({}));
    try {
      const retorno = await payer.login(body);
      send(res, 200, { ok: true, retorno });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && path === "/payer/logoff") {
    try {
      const retorno = await payer.logoff();
      send(res, 200, { ok: true, retorno });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && path === "/payer/payment") {
    const body = await readBody(req);
    try {
      const retorno = body?.wait
        ? await payer.requestPaymentAndWait(body)
        : await payer.requestPayment(body);
      send(res, 200, { ok: true, retorno });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "GET" && path === "/payer/response") {
    try {
      const retorno = await payer.getResponse();
      send(res, 200, { ok: true, retorno });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && path === "/payer/abort") {
    try {
      const retorno = await payer.abort();
      send(res, 200, { ok: true, retorno });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  return false;
}

module.exports = { handlePayerRoutes };
