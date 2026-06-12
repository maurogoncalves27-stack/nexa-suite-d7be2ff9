---
name: TEF PayGo - defaults sandbox
description: Valores padrão imutáveis para instalação/ativação do PdC PayGo Integrado (sandbox/DEMO)
type: feature
---
Defaults oficiais do PayGo Integrado para o nosso ambiente de homologação/DEMO — usar SEMPRE como pré-preenchimento na tela `/configuracoes/tef-paygo` e em payloads de teste para o agente Electron (`electron-acbr/acbr-tefd.cjs`):

- **CNPJ**: `44932369000108`
- **PdC (Ponto de Captura)**: `111476`
- **Ambiente (host:porta)**: `pos-transac-sb.tpgweb.io:31735`
- **Senha técnica**: `314159` (senha técnica padrão DEMO PayGo)
- **Porta Pinpad**: `5`

Arquitetura confirmada:
- Agente Electron buildado em **ia32 (32 bits)** porque a `PGWebLib.dll` instalada pelo PayGo Windows fica em `C:\Program Files (x86)\...` (32 bits). Não voltar para `--x64` no `electron-acbr/package.json`.
- Instalação/ativação do PdC é feita pela **UI oficial Setis** (modo DEMO via 3 cliques no logo) — NÃO programática. Endpoints `instalarPdc`/`PWOPER.INSTALL` continuam deprecated.
