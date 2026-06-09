# NEXA ACBr Agent — Release

Um único comando empacota, versiona e prepara o instalador `.exe` para entrega.

## Comandos

Rode dentro de `electron-acbr/`:

```bash
npm run release          # bump patch (1.3.3 → 1.3.4) — padrão
npm run release:minor    # 1.3.x → 1.4.0
npm run release:major    # 1.x.x → 2.0.0
npm run release:keep     # mantém a versão atual, só rebuilda
```

## O que o script faz

1. Faz bump da versão em `package.json` (a menos que use `--keep`).
2. `npm install` (idempotente).
3. `electron-builder --win nsis --x64` (limpa `release/` antes).
4. Copia o `.exe` final para `releases/NEXA-ACBr-Agent-Setup-<versão>.exe`.
5. Calcula SHA-256 e grava `releases/latest.json`:
   ```json
   {
     "version": "1.3.4",
     "file": "NEXA-ACBr-Agent-Setup-1.3.4.exe",
     "sha256": "…",
     "sizeBytes": 98765432,
     "releasedAt": "2026-06-09T13:00:00.000Z"
   }
   ```

`releases/*.exe` é ignorado pelo git; apenas `latest.json` é versionado.

## Distribuir para o lojista

1. Envie o `.exe` gerado (`releases/NEXA-ACBr-Agent-Setup-<versão>.exe`).
2. No PC do lojista:
   - Desinstale o **NEXA ACBr Agent** anterior pelo Painel de Controle.
   - Rode o novo instalador.
   - Abra `https://127.0.0.1:3031/health` e confirme `"version":"<versão>"`.

## Pré-requisitos

- Node.js 18+ e npm.
- Windows (electron-builder usa NSIS — não roda no Linux sem wine).
- `build/icon.ico` presente (já incluso no repo).

## Próximos passos (futuros)

- Hospedar `latest.json` em CDN pública → o agente checa e baixa atualização automática.
- Assinatura digital do `.exe` (requer certificado pago).
