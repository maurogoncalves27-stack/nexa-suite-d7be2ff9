// Processo principal do Electron - Nexa PDV (Loja) Desktop
// Responsável por:
//  - Abrir a janela que carrega o app web em /loja (StoreHome: PDV + atalhos da loja)
//  - Expor IPC para impressão térmica ESC/POS (USB Bematech / Rede Gertec)
//  - Listar impressoras USB instaladas no Windows
//
// Comunicação: o frontend chama window.electron.* (definido em preload.cjs).
// Build: feito SOMENTE no final do projeto via @electron/packager (--platform=win32).
// Trava de loja: a tela /loja usa o RPC `get_terminal_store_id` (tabela
// store_terminal_users) — quando o usuário logado é um terminal de loja, o
// seletor abre travado na loja específica e o PDV só vê os pedidos dela.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { startSitefAgent, stopSitefAgent } = require("./sitef-agent.cjs");

// ESC/POS - import preguiçoso pra não quebrar caso o módulo não esteja instalado em dev
let ThermalPrinter, PrinterTypes;
try {
  const tp = require("node-thermal-printer");
  ThermalPrinter = tp.printer;
  PrinterTypes = tp.types;
} catch (e) {
  console.warn("[electron] node-thermal-printer não instalado ainda; impressão real desabilitada.");
}

// URL do app: em dev usa o servidor Vite, em prod aponta pro Lovable publicado.
// Mesmo que a máquina tenha uma NEXA_URL antiga salva com /balcao, o wrapper
// sempre normaliza para /loja.
const DEFAULT_APP_URL = app.isPackaged
  ? "https://nexasuite.aquelaparme.com.br/loja"
  : "http://localhost:8080/loja";

function normalizeAppUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_APP_URL;

  try {
    const url = new URL(rawUrl);
    url.pathname = "/loja";
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_APP_URL;
  }
}

const APP_URL = normalizeAppUrl(process.env.NEXA_URL || DEFAULT_APP_URL);


let mainWindow;

// Evita que qualquer window.print() herdado do app web abra o diálogo do Windows.
app.commandLine.appendSwitch("kiosk-printing");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    autoHideMenuBar: true,
    title: "Nexa PDV",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.executeJavaScript(`
      (() => {
        window.print = () => console.warn('[electron] window.print bloqueado; use impressão silenciosa via Electron');
      })();
    `).catch(() => {});
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  // Sobe o agente HTTP local do SiTef antes da janela abrir
  try { startSitefAgent(); }
  catch (e) { console.error("[electron] falha ao iniciar agente SiTef", e); }
  createWindow();
});

app.on("window-all-closed", () => {
  stopSitefAgent();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopSitefAgent();
});

// IPC: status do agente SiTef pra UI
ipcMain.handle("sitef:health", async () => {
  try {
    const port = parseInt(process.env.SITEF_AGENT_PORT || "60906", 10);
    const r = await fetch(`http://127.0.0.1:${port}/sitef/health`);
    return await r.json();
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// IPC: listar impressoras USB instaladas no Windows
// ============================================================
ipcMain.handle("printers:list", async () => {
  if (!mainWindow) return [];
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (e) {
    console.error("[electron] printers:list erro", e);
    return [];
  }
});

ipcMain.handle("printer:silentPrint", async (_evt, { html, deviceName } = {}) => {
  try {
    const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
    const targetDevice =
      deviceName ||
      printers.find((p) => /G250|Gertec|POS|EPSON/i.test(`${p.name} ${p.displayName || ""}`))?.name ||
      printers.find((p) => p.isDefault)?.name;

    if (!targetDevice) {
      console.warn("[electron] nenhuma impressora instalada encontrada; diálogo do Windows suprimido");
      return { ok: true, warning: "Nenhuma impressora instalada encontrada" };
    }

    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true },
    });
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html || ""));
    await new Promise((resolve, reject) => {
      win.webContents.print({ silent: true, printBackground: true, deviceName: targetDevice, margins: { marginType: "none" } }, (success, failureReason) => {
        try { win.close(); } catch {}
        if (success) resolve();
        else reject(new Error(failureReason || "print failed"));
      });
    });
    return { ok: true };
  } catch (e) {
    console.error("[electron] printer:silentPrint erro", e);
    return { ok: true, warning: e?.message ?? String(e) };
  }
});

// ============================================================
// IPC: imprimir ESC/POS (cupom cliente / comanda cozinha / teste)
// payload = {
//   connection_type: "usb" | "network",
//   host?: string, port?: number,
//   usb_device_name?: string,
//   printer_model: string,
//   content: { type: "test" | "customer" | "kitchen", data: any }
// }
// ============================================================
ipcMain.handle("printer:print", async (_evt, payload) => {
  if (!ThermalPrinter) {
    return { ok: false, error: "node-thermal-printer não instalado (rode bun add no build final)" };
  }

  try {
    const interfaceStr =
      payload.connection_type === "network"
        ? `tcp://${payload.host}:${payload.port ?? 9100}`
        : `printer:${payload.usb_device_name}`;

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON, // Bematech MP-4200 e Gertec G250 falam ESC/POS Epson-compatível
      interface: interfaceStr,
      width: 48,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { ok: false, error: `Impressora não respondeu em ${interfaceStr}` };
    }

    renderContent(printer, payload.content);
    printer.cut();          // corte automático
    printer.beep();         // bipe pra avisar a equipe
    await printer.execute();

    return { ok: true };
  } catch (e) {
    console.error("[electron] printer:print erro", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// ============================================================
// Renderiza o conteúdo no buffer ESC/POS conforme o tipo
// ============================================================
function renderContent(printer, content) {
  const { type, data } = content || {};

  if (type === "test") {
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(1, 1);
    printer.println("TESTE DE IMPRESSAO");
    printer.bold(false); printer.setTextNormal();
    printer.drawLine();
    printer.alignLeft();
    printer.println(`Loja:        ${data?.storeName ?? "-"}`);
    printer.println(`Impressora:  ${data?.printerName ?? "-"}`);
    printer.println(`Conexao:     ${data?.connection ?? "-"}`);
    printer.println(`Funcao:      ${data?.role ?? "-"}`);
    printer.drawLine();
    printer.println("Se este texto saiu corretamente,");
    printer.println("o cadastro esta OK.");
    printer.newLine();
    printer.alignCenter();
    printer.println(new Date().toLocaleString("pt-BR"));
    return;
  }

  if (type === "customer") {
    // Cupom do cliente (resumo do pedido)
    const layout = data?.layout || {};
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(1, 1);
    printer.println(data?.storeName ?? "Nexa");
    printer.bold(false); printer.setTextNormal();
    if (layout.header_text) {
      String(layout.header_text).split(/\r?\n/).forEach((ln) => printer.println(ln));
    }
    if (data?.address) printer.println(data.address);
    printer.drawLine();
    printer.alignLeft();
    printer.println(`Pedido: ${data?.orderNumber ?? "-"}`);
    printer.println(`Data:   ${new Date().toLocaleString("pt-BR")}`);
    if (data?.customerName) printer.println(`Cliente: ${data.customerName}`);
    printer.drawLine();
    (data?.items ?? []).forEach((it) => {
      printer.println(`${it.qty}x ${it.name}`);
      if (it.unitPrice != null) {
        printer.alignRight();
        printer.println(`R$ ${(it.qty * it.unitPrice).toFixed(2)}`);
        printer.alignLeft();
      }
      if (it.note) printer.println(`   obs: ${it.note}`);
    });
    printer.drawLine();
    printer.alignRight();
    printer.bold(true);
    printer.println(`TOTAL: R$ ${(data?.total ?? 0).toFixed(2)}`);
    printer.bold(false);
    printer.alignLeft();
    if (data?.paymentMethod) printer.println(`Pagamento: ${data.paymentMethod}`);
    printer.newLine();
    printer.alignCenter();
    printer.println(layout.footer_text ?? "Obrigado pela preferencia!");
    return;
  }

  if (type === "kitchen") {
    // Comanda da cozinha - texto grande por padrão, sem preço
    const layout = data?.layout || {};
    const doubleSize = layout.double_size !== false;
    const showPrices = !!layout.show_prices;
    const showTime = layout.show_time !== false;
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(2, 2);
    printer.println("COZINHA");
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();
    printer.alignLeft();
    printer.bold(true);
    printer.println(`Pedido #${data?.orderNumber ?? "-"}`);
    printer.bold(false);
    if (showTime) printer.println(new Date().toLocaleTimeString("pt-BR"));
    if (data?.tableOrChannel) printer.println(data.tableOrChannel);
    printer.drawLine();
    (data?.items ?? []).forEach((it) => {
      if (doubleSize) printer.setTextSize(1, 1);
      printer.println(`${it.qty}x ${it.name}`);
      if (showPrices && it.unitPrice != null) {
        printer.println(`   R$ ${(it.qty * it.unitPrice).toFixed(2)}`);
      }
      printer.setTextNormal();
      if (it.note) printer.println(`   >> ${it.note}`);
    });
    printer.drawLine();
    return;
  }

  if (type === "totem") {
    // Cupom/senha do TOTEM — número grande, mensagem curta
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(1, 1);
    printer.println(data?.storeName ?? "Nexa");
    printer.bold(false); printer.setTextNormal();
    printer.println("AUTOATENDIMENTO");
    printer.drawLine();
    printer.println("SUA SENHA");
    printer.bold(true); printer.setTextSize(3, 3);
    printer.println(String(data?.orderNumber ?? "-"));
    printer.bold(false); printer.setTextNormal();
    printer.drawLine();
    printer.alignLeft();
    if (data?.customerName) printer.println(`Cliente: ${data.customerName}`);
    printer.println(`Data: ${new Date().toLocaleString("pt-BR")}`);
    printer.drawLine();
    (data?.items ?? []).forEach((it) => {
      printer.println(`${it.qty}x ${it.name}`);
      if (it.note) printer.println(`   obs: ${it.note}`);
    });
    printer.drawLine();
    printer.alignRight();
    printer.bold(true);
    printer.println(`TOTAL: R$ ${(data?.total ?? 0).toFixed(2)}`);
    printer.bold(false);
    printer.alignLeft();
    if (data?.paymentMethod) printer.println(`Pagamento: ${data.paymentMethod}`);
    printer.newLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println(data?.message ?? "Aguarde sua senha ser chamada");
    printer.bold(false);
    return;
  }

  // fallback
  printer.println(JSON.stringify(content));
}
