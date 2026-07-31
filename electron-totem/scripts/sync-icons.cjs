// Copia o ícone oficial NEXA (icones/nexa_icone.*) para build/icon.*
// A pasta build/ é ignorada pelo git, então é gerada localmente antes do empacotamento.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..");
const buildDir = path.join(root, "build");

fs.mkdirSync(buildDir, { recursive: true });

const pairs = [
  ["nexa_icone.ico", "icon.ico"],
  ["nexa_icone.png", "icon.png"],
];

for (const [src, dest] of pairs) {
  const from = path.join(repoRoot, "icones", src);
  if (!fs.existsSync(from)) {
    console.error(`[icons] fonte ausente: ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(buildDir, dest));
  console.log(`[icons] ${src} -> build/${dest}`);
}
