#!/usr/bin/env node
// Runner isolado para testar PayGo/PGWebLib sem tocar no agente principal.
// Usa o bridge PowerShell existente, mas fica em pasta paralela ate a refatoracao
// TypeScript estar comprovada no pinpad.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE = path.join(ROOT, "scripts", "paygo-bridge.ps1");

const DEFAULT_DLL_PATHS = [
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\PGWebLib.dll",
];

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "help";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      out._.push(item);
      continue;
    }
    const raw = item.slice(2);
    const eq = raw.indexOf("=");
    if (eq >= 0) {
      out[raw.slice(0, eq)] = raw.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[raw] = next;
      i++;
    } else {
      out[raw] = true;
    }
  }
  return out;
}

function findDllPath() {
  if (args.dll && fs.existsSync(args.dll)) return args.dll;
  if (process.env.PAYGO_DLL_PATH && fs.existsSync(process.env.PAYGO_DLL_PATH)) return process.env.PAYGO_DLL_PATH;
  return DEFAULT_DLL_PATHS.find((p) => fs.existsSync(p)) || "";
}

function resolveWorkingDir(dllPath) {
  if (args.workdir) return args.workdir;
  if (process.env.PAYGO_WORKING_DIR) return process.env.PAYGO_WORKING_DIR;
  if (process.env.LOCALAPPDATA) {
    const dir = path.join(process.env.LOCALAPPDATA, "NexaACBr", "PayGoReference");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return dllPath ? path.dirname(dllPath) : ROOT;
}

function printHelp() {
  console.log(`
PayGo ACBr reference runner

Comandos:
  node runner.cjs maintenance
  node runner.cjs config
  node runner.cjs install --cpf 44932369000108 --pdc 111476 --ambiente DEMO --senha 314159 --pinpad 5
  node runner.cjs commtest
  node runner.cjs sale --amount 1.00 --method debit --sale-id TESTE001
  node runner.cjs pix --amount 3.00 --sale-id PIX001 --qr checkout
  node runner.cjs admin
  node runner.cjs cleanup
  node runner.cjs confirm --json "{\\"reqNum\\":\\"...\\",\\"locRef\\":\\"...\\",\\"extRef\\":\\"...\\",\\"virtMerch\\":\\"...\\",\\"authSyst\\":\\"...\\"}"
  node runner.cjs undo --json "{\\"reqNum\\":\\"...\\",\\"locRef\\":\\"...\\",\\"extRef\\":\\"...\\",\\"virtMerch\\":\\"...\\",\\"authSyst\\":\\"...\\"}"

Opcoes uteis:
  --dll "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll"
  --workdir "C:\\Users\\...\\PayGoReference"
  --menu REDE
  --captures "USERAUTH=314159;TYPED=123"
  --timeout 600000
  --qr checkout|pinpad
  --cpf 44932369000108
  --pdc 111476
  --ambiente DEMO
  --senha 314159
  --pinpad 5
`);
}

function methodToBridge(value) {
  const v = String(value || "debit").toLowerCase();
  if (v === "credit" || v === "credito" || v === "credito") return "CREDITO";
  if (v === "pix") return "PIX";
  if (v === "voucher") return "VOUCHER";
  return "DEBITO";
}

function amountToCents(value) {
  const n = Number(String(value || "1").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Informe --amount com valor maior que zero");
  return Math.round(n * 100);
}

function capturesToBase64(value) {
  if (!value) return "";
  return Buffer.from(String(value).replace(/;/g, "\n"), "utf8").toString("base64");
}

function optionValue(...names) {
  for (const name of names) {
    const value = args[name];
    if (value !== undefined && value !== true && String(value).trim()) return String(value);
  }
  return "";
}

function confirmationToBase64() {
  if (args.token) return String(args.token);
  if (!args.json) throw new Error("Informe --json com reqNum/locRef/extRef/virtMerch/authSyst ou --token base64");
  JSON.parse(String(args.json));
  return Buffer.from(String(args.json), "utf8").toString("base64");
}

function createQuestion() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask(query) {
      return new Promise((resolve) => rl.question(query, resolve));
    },
    close() {
      rl.close();
    },
  };
}

class PayGoHost {
  constructor() {
    this.dllPath = findDllPath();
    if (!this.dllPath) {
      throw new Error("PGWebLib.dll nao encontrada. Use --dll ou defina PAYGO_DLL_PATH.");
    }
    this.workingDir = resolveWorkingDir(this.dllPath);
    this.pending = new Map();
    this.buffer = "";
    this.nextId = 1;
    this.question = createQuestion();
  }

  start() {
    if (!fs.existsSync(BRIDGE)) throw new Error(`Bridge nao encontrado: ${BRIDGE}`);

    this.child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      BRIDGE,
      "-Action",
      "host",
      "-DllPath",
      this.dllPath,
      "-WorkingDir",
      this.workingDir,
    ], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) console.error(`[stderr] ${text}`);
    });
    this.child.on("exit", (code, signal) => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timeout);
        item.reject(new Error(`Host PayGo encerrado code=${code ?? ""} signal=${signal ?? ""}`.trim()));
      }
      this.pending.clear();
    });

    return this.waitReady();
  }

  waitReady() {
    return new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
      setTimeout(() => reject(new Error("Timeout inicializando host PayGo")), 60000);
    });
  }

  onStdout(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        console.log(line);
        continue;
      }

      if (msg.id === "__ready") {
        if (msg.error) this.ready?.reject(new Error(msg.error));
        else this.ready?.resolve(msg.payload);
        continue;
      }

      if (msg.event) {
        this.printEvent(msg.event);
        if (msg.event.type === "CAPTURE") {
          this.answerCapture(msg.id, msg.event).catch((err) => {
            console.error(`[capture] ${err.message}`);
            this.write({ id: msg.id, action: "abort_capture" });
          });
        }
        continue;
      }

      const pending = this.pending.get(msg.id);
      if (!pending) {
        console.log(JSON.stringify(msg, null, 2));
        continue;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.payload);
    }
  }

  printEvent(event) {
    if (event.type === "QRCODE") {
      console.log("\n[QRCODE]");
      console.log(event.message);
      console.log("[/QRCODE]\n");
      return;
    }

    if (event.type === "CAPTURE") {
      console.log(`\n[CAPTURE] ${event.prompt || "Entrada solicitada"} id=${event.identificador}`);
      if (Array.isArray(event.options) && event.options.length) {
        for (const option of event.options) {
          console.log(`  ${option.value || ""} ${option.label || option.text || ""}`.trim());
        }
      }
      return;
    }

    console.log(`[${event.type || "INFO"}] ${event.message || ""}`);
  }

  async answerCapture(id, event) {
    let value = "";
    if (Array.isArray(event.options) && event.options.length) {
      value = await this.question.ask("Escolha a opcao do PayGo: ");
    } else {
      value = await this.question.ask(`${event.prompt || "Valor"}: `);
    }
    this.write({
      id,
      action: "capture_response",
      identificador: Number(event.identificador),
      value,
    });
  }

  write(payload) {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  command(action, payload = {}) {
    const id = `ref-${this.nextId++}`;
    const timeoutMs = Number(args.timeout || 600000);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout aguardando ${action}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.write({ id, action, ...payload });
    });
  }

  stop() {
    this.question.close();
    if (this.child && !this.child.killed) this.child.kill();
  }
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const host = new PayGoHost();
  try {
    const ready = await host.start();
    console.log(`[ready] ${ready.message || "PayGo host inicializado"}`);
    console.log(`[dll] ${host.dllPath}`);
    console.log(`[workdir] ${host.workingDir}`);

    let result;
    if (command === "maintenance") {
      result = await host.command("maintenance");
    } else if (command === "config") {
      result = await host.command("config");
    } else if (command === "install") {
      result = await host.command("install", {
        cpfCnpj: optionValue("cpf", "cnpj", "cpfCnpj") || "44932369000108",
        pontoDeCaptura: optionValue("pdc", "ponto", "pontoDeCaptura") || "111476",
        ambiente: optionValue("ambiente", "host") || "DEMO",
        senhaTecnica: optionValue("senha", "senhaTecnica") || "314159",
        usePinpad: args["no-pinpad"] ? "0" : "1",
        pinpadPort: optionValue("pinpad", "pinpadPort", "com") || "5",
        paygoMenuChoice: args.menu || "",
      });
    } else if (command === "commtest") {
      result = await host.command("commtest");
    } else if (command === "cleanup") {
      result = await host.command("cleanup", {}, { timeoutMs: 30000 });
    } else if (command === "admin") {
      result = await host.command("admin");
    } else if (command === "confirm" || command === "undo") {
      result = await host.command(command, { confirmationJsonBase64: confirmationToBase64() });
    } else if (command === "sale" || command === "pix") {
      const method = command === "pix" ? "PIX" : methodToBridge(args.method);
      result = await host.command("sale", {
        saleId: args["sale-id"] || args.saleId || `REF${Date.now()}`,
        amountInCents: amountToCents(args.amount),
        method,
        installments: Number(args.installments || 1),
        paygoMenuChoice: args.menu || "",
        captureValuesBase64: capturesToBase64(args.captures),
        qrDisplayPreference: args.qr === "pinpad" ? "1" : "2",
      });
    } else {
      throw new Error(`Comando desconhecido: ${command}`);
    }

    console.log("\n[resultado]");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    host.stop();
  }
}

main().catch((err) => {
  console.error(`\n[erro] ${err.message}`);
  process.exitCode = 1;
});
