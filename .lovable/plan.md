## Rebuild do Nexa PDV (Loja) — nova versão Windows

A build já existe em `electron/` (electron-builder + NSIS x64). O app aponta para `https://rhplus.lovable.app/balcao` em produção, então **basta bumpar a versão e rodar o build localmente** — não precisa mexer em código do React/Vite.

### O que eu vou fazer aqui no repo

1. **`electron/package.json`** — bump de `version` de `1.0.0` para a próxima (sugestão: `1.0.1`).
2. **Confirmar `icon.ico`** continua sendo o ícone NEXA oficial (sem alterar arquivo).

Nada mais muda no projeto. Sem alterações em `src/`, `vite.config.ts`, `main.cjs`, `preload.cjs` ou `sitef-agent.cjs`.

### O que você roda na sua máquina (Windows)

No seu repo local `C:\Users\Mauro\Documents\GitHub\rhplus`:

```powershell
cd electron
npm install
npm run dist:win
```

Saída: `electron/release/Nexa PDV Setup 1.0.1.exe` (instalador NSIS x64).

### Perguntas rápidas antes de eu aplicar

- Versão nova: **1.0.1** (patch) está bom, ou prefere outra (`1.1.0` / valor específico)?
- Posso assumir que **nada do código mudou desde a última build** e o objetivo é só re-empacotar o wrapper apontando para a mesma URL publicada?

Se confirmar, eu só altero o `version` no `electron/package.json` e você roda o `dist:win`.
