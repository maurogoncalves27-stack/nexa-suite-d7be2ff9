#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * NEXA ACBr Agent — release PORTÁTIL (sem instalar).
 *
 * Gera um único .exe portátil (electron-builder target "portable"):
 * o lojista só copia para uma pasta e executa — não passa pelo instalador,
 * não precisa de Painel de Controle, não cria atalho.
 *
 * Uso:
 *   node scripts/release-portable.cjs            # bump patch
 *   node scripts/release-portable.cjs --minor    # bump minor
 *   node scripts/release-portable.cjs --major    # bump major
 *   node scripts/release-portable.cjs --keep     # NÃO faz bump
 *
 * Saída:
 *   electron-acbr/releases/NEXA-ACBr-Agent-Portable-<versão>.exe
 *   electron-acbr/releases/latest-portable.json
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

const log = (s, m) => console.log(`\x1b[36m${s}\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };

function bumpVersion(v, kind) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) fail(`Versão atual inválida em package.json: "${v}"`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === "major") { maj++; min = 0; pat = 0; }
  else if (kind === "minor") { min++; pat = 0; }
  else if (kind === "patch") { pat++; }
  return `${maj}.${min}.${pat}`;
}

function run(cmd, cmdArgs) {
  const isWin = process.platform === "win32";
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: isWin });
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

function findPortableExe(version) {
  const dir = path.join(ROOT, "release");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  // padrão definido em package.json: "NEXA-ACBr-Agent-Portable-<v>.exe"
  const exact = files.find(
    (f) => f.toLowerCase().endsWith(".exe") && f.includes("Portable") && f.includes(version),
  );
  if (exact) return path.join(dir, exact);
  const anyPortable = files.find(
    (f) => f.toLowerCase().endsWith(".exe") && f.toLowerCase().includes("portable"),
  );
  return anyPortable ? path.join(dir, anyPortable) : null;
}

async function main() {
  const t0 = Date.now();

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

  log("→", "Verificando dependências (npm install)...");
  run("npm", ["install", "--no-audit", "--no-fund"]);
  ok("Dependências OK");

  log("→", "Build do portátil (electron-builder --win portable)...");
  run("npm", ["run", "dist:win:portable"]);
  ok(`Build concluído (${Math.round((Date.now() - t0) / 1000)}s)`);

  const built = findPortableExe(next);
  if (!built) fail(`Não encontrei o .exe portátil em ${path.join(ROOT, "release")}.`);

  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const finalName = `NEXA-ACBr-Agent-Portable-${next}.exe`;
  const finalPath = path.join(RELEASES_DIR, finalName);
  fs.copyFileSync(built, finalPath);
  const stat = fs.statSync(finalPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  ok(`Portátil: releases/${finalName} (${sizeMB} MB)`);

  const sha = await sha256File(finalPath);
  ok(`SHA-256: ${sha}`);

  const latest = {
    kind: "portable",
    version: next,
    file: finalName,
    sha256: sha,
    sizeBytes: stat.size,
    releasedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(RELEASES_DIR, "latest-portable.json"),
    JSON.stringify(latest, null, 2) + "\n",
    "utf8",
  );
  ok("latest-portable.json atualizado");

  console.log("");
  console.log("\x1b[33m→ Como usar no PC do lojista:\x1b[0m");
  console.log(`   1) Copie ${finalName} para uma pasta (ex.: C:\\NEXA\\).`);
  console.log("   2) Dê duplo clique. Não precisa instalar nem ser admin.");
  console.log(`   3) Abra https://127.0.0.1:3031/health e confirme "version":"${next}".`);
  console.log("   Obs.: o .exe portátil extrai os arquivos em %TEMP% a cada execução.");
  console.log("");
}

main().catch((e) => fail(e?.message || String(e)));
