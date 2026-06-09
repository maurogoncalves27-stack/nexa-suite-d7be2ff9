# Automatizar build/release do NEXA ACBr Agent

Hoje, toda mudança em `electron-acbr/acbr-tefd.cjs` ou `server.cjs` exige passos manuais (bump de versão, `npm install`, `npm run dist`, desinstalar antigo, instalar novo). O plano cria um único comando `npm run release` que faz tudo e deixa o `.exe` pronto pra entregar.

## O que será criado

1. **`electron-acbr/scripts/release.cjs`** — script Node que orquestra o release:
   - Lê a versão atual de `package.json`.
   - Faz bump automático (`patch` por padrão; `--minor` ou `--major` opcionais).
   - Roda `npm install` (idempotente).
   - Roda o build do instalador (`electron-builder --win nsis` — já é o que o `npm run dist` chama).
   - Copia o `.exe` final pra `electron-acbr/releases/NEXA-ACBr-Agent-Setup-<versão>.exe` (pasta versionada, não sobrescreve histórico).
   - Gera/atualiza `electron-acbr/releases/latest.json` com `{ version, file, sha256, releasedAt }` — base pra auto-update futuro.
   - Imprime no console um checklist final (URL `https://127.0.0.1:3031/health` pra validar versão depois da reinstalação).

2. **`electron-acbr/package.json`** — adicionar scripts:
   ```json
   "release": "node scripts/release.cjs",
   "release:minor": "node scripts/release.cjs --minor",
   "release:major": "node scripts/release.cjs --major"
   ```

3. **`electron-acbr/releases/.gitignore`** — ignorar `*.exe` (binários não vão pro repo) mas manter `latest.json` versionado.

4. **`electron-acbr/RELEASE.md`** — guia curto: como rodar, onde sai o `.exe`, como o lojista reinstala, como validar.

## Fluxo de uso

```
cd electron-acbr
npm run release           # patch (1.3.3 → 1.3.4)
npm run release:minor     # 1.3.x → 1.4.0
```

Saída esperada:
```
✓ Versão: 1.3.3 → 1.3.4
✓ Dependências OK
✓ Build concluído (38s)
✓ Instalador: releases/NEXA-ACBr-Agent-Setup-1.3.4.exe (94 MB)
✓ SHA-256: a1b2c3...
✓ latest.json atualizado
→ Próximos passos:
   1) Desinstalar NEXA ACBr Agent antigo no PC
   2) Rodar releases/NEXA-ACBr-Agent-Setup-1.3.4.exe
   3) Abrir https://127.0.0.1:3031/health e conferir "version":"1.3.4"
```

## O que NÃO faz parte deste plano

- Auto-update real (download + troca de binário em runtime) — fica pra um segundo passo, mas o `latest.json` já prepara o terreno.
- Assinatura digital do `.exe` (precisa de certificado pago).
- Upload automático pro servidor de distribuição — por ora o arquivo fica local pra você baixar/enviar.

## Detalhes técnicos

- O script é `.cjs` porque `package.json` do agente provavelmente já está em CommonJS (consistente com `acbr-tefd.cjs`/`server.cjs`).
- Bump de versão é manual via `fs` + regex no `package.json` (sem `npm version`, pra não criar tag git automaticamente).
- SHA-256 calculado com `crypto.createHash('sha256')` lendo o `.exe` em stream.
- O caminho do `.exe` gerado pelo electron-builder normalmente é `electron-acbr/dist/NEXA ACBr Agent Setup <versão>.exe` — o script localiza pelo padrão e renomeia/copia.

Quando você aprovar, eu implemento.
