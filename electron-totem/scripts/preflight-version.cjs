// Preflight de release do Nexa Totem.
// Confere que os arquivos essenciais do pacote existem antes de empacotar.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));

const required = [
  "main.cjs",
  "preload.cjs",
  "sitef-agent.cjs",
  "sitef-real.cjs",
  "payer/agent.cjs",
  "payer/localhost.cjs",
  "build/icon.ico",
  "build/icon.png",
];

const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error("[preflight] arquivos ausentes:\n  - " + missing.join("\n  - "));
  process.exit(1);
}

try {
  require.resolve("selfsigned", { paths: [root] });
} catch {
  console.error("[preflight] dependência 'selfsigned' não instalada. Rode: npm install");
  process.exit(1);
}

console.log(`[preflight] Nexa Totem v${pkg.version} — OK (Payer + Epson TM-T20X)`);
