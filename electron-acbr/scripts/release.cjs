#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * NEXA ACBr Agent — release builder.
 *
 * Uso:
 *   node scripts/release.cjs            # bump patch (1.3.3 -> 1.3.4)
 *   node scripts/release.cjs --minor    # bump minor
 *   node scripts/release.cjs --major    # bump major
 *   node scripts/release.cjs --keep     # NÃO faz bump, usa versão atual
 *
 * Saída: electron-acbr/releases/NEXA-ACBr-Agent-Setup-<versão>.exe
 *        electron-acbr/releases/latest.json
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const RELEASES_DIR = path.join(ROOT, "releases");

const args = new Set(process.argv.slice(2));
const bumpKind = args.has("--major")
  ? "major"
  : args.has("--minor")
    ? "minor"
    : args.has("--keep")
      ? "keep"
      : "patch";

function log(step, msg) {
  console.log(`\x1b[36m${step}\x1b[0m ${msg}`);
}
function ok(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
}

function bumpVersion(v, kind) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) fail(`Versão atual inválida em package.json: "${v}"`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === "major") { maj++; min = 0; pat = 0; }
  else if (kind === "minor") { min++; pat = 0; }
  else if (kind === "patch") { pat++; }
  return `${maj}.${min}.${pat}`;
}

function run(cmd, cmdArgs, opts = {}) {
  const isWin = process.platform === "win32";
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin, // necessário pra resolver npm/npx no Windows
    ...opts,
  });
  if (r.status !== 0) fail(`Comando falhou: ${cmd} ${cmdArgs.join(" ")}`);
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(file);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

function findBuiltInstaller(version) {
  // electron-builder gera em release/. Procuramos o .exe que case com a versão.
  const dir = path.join(ROOT, "release");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  // padrão: "NEXA ACBr Agent Setup 1.3.4.exe"
  const exact = files.find((f) => f.endsWith(".exe") && f.includes(version));
  if (exact) return path.join(dir, exact);
  const anyExe = files.find((f) => f.endsWith(".exe"));
  return anyExe ? path.join(dir, anyExe) : null;
}

async function main() {
  const t0 = Date.now();

  // 1) Bump version
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const prev = pkg.version;
  const next = bumpKind === "keep" ? prev : bumpVersion(prev, bumpKind);
  if (next !== prev) {
    pkg.version = next;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    ok(`Versão: ${prev} → ${next}`);
  } else {
    ok(`Versão mantida em ${prev}`);
  }

  // 2) npm install (idempotente)
  log("→", "Verificando dependências (npm install)...");
  run("npm", ["install", "--no-audit", "--no-fund"]);
  ok("Dependências OK");

  // 3) Build do instalador
  log("→", "Build do instalador (electron-builder --win nsis)...");
  run("npm", ["run", "dist:win"]);
  ok(`Build concluído (${Math.round((Date.now() - t0) / 1000)}s)`);

  // 4) Copiar pra releases/
  const built = findBuiltInstaller(next);
  if (!built) fail(`Não encontrei o .exe gerado em ${path.join(ROOT, "release")}.`);
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const finalName = `NEXA-ACBr-Agent-Setup-${next}.exe`;
  const finalPath = path.join(RELEASES_DIR, finalName);
  fs.copyFileSync(built, finalPath);
  const stat = fs.statSync(finalPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  ok(`Instalador: releases/${finalName} (${sizeMB} MB)`);

  // 5) SHA-256
  const sha = await sha256File(finalPath);
  ok(`SHA-256: ${sha}`);

  // 6) latest.json
  const latest = {
    version: next,
    file: finalName,
    sha256: sha,
    sizeBytes: stat.size,
    releasedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(RELEASES_DIR, "latest.json"),
    JSON.stringify(latest, null, 2) + "\n",
    "utf8",
  );
  ok("latest.json atualizado");

  console.log("");
  console.log("\x1b[33m→ Próximos passos no PC do lojista:\x1b[0m");
  console.log("   1) Desinstale o NEXA ACBr Agent anterior (Painel de Controle).");
  console.log(`   2) Rode: releases/${finalName}`);
  console.log(`   3) Abra https://127.0.0.1:3031/health e confirme \"version\":\"${next}\".`);
  console.log("");
}

main().catch((e) => fail(e?.message || String(e)));
