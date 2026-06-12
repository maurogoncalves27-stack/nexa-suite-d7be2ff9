---
name: TEF PayGo — host PowerShell + C#
description: Arquitetura nova do agente TEF (12/06/2026) — PGWebLib.dll acessada via PS+C# P/Invoke em vez de node-ffi
type: feature
---

A partir de **electron-acbr v1.5.0** o agente NÃO usa mais `koffi`/`ffi-napi` para falar com a PGWebLib.dll.

Em vez disso:

1. `electron-acbr/scripts/paygo-bridge.ps1` (copiado **na íntegra** da demo de referência https://github.com/luiz-cesar-almeida/integracao_tef_paygo, NÃO alterar conteúdo) compila um adapter C# em memória que faz `LoadLibrary("PGWebLib.dll")` + `GetProcAddress` para todas as funções `PW_i*`.
2. `electron-acbr/acbr-tefd.cjs` faz `spawn('powershell.exe', ['-File', bridge, '-Action', 'host', ...])` e mantém um processo persistente.
3. Comunicação via stdin/stdout em JSON line-delimited: `{ id, action, ... }` no stdin, `{ id, payload|error|event }` no stdout.
4. Primeira linha do host: `{ id:"__ready", payload:{ ok:true } }`. Só depois disso o adapter aceita comandos.

Defaults travados pro ambiente NEXA sandbox (overridáveis via env):
- `PAYGO_CNPJ=44932369000108`
- `PAYGO_PDC=111476`
- `PAYGO_AMBIENTE=DEMO`
- `PAYGO_SENHA_TECNICA=314159`
- `PAYGO_PINPAD_PORT=5`

**Limitação atual:** o bridge do amigo NÃO suporta o fluxo de captura interativa (PWDAT_MENU/PWDAT_TYPED com pergunta-resposta). A escolha de menu (ex.: "1=Instalação do Pinpad", "2=Teste de Comunicação") tem que vir no payload inicial como `paygoMenuChoice`. A UI `TefPinpadSetupCard.tsx` ainda manda o fluxo antigo (`respondAdm`) — vai precisar de ajuste futuro pra coletar a escolha antes de chamar `/tef/admin`. Por enquanto `respondAdm()` retorna erro explicativo.

**Por que mudou:** `koffi`/`ffi-napi` travavam em `PW_iPPEventLoop` retornando "Iniciando..." indefinidamente. C# P/Invoke é a forma oficial Setis e funciona em x64 nativo. iFood/NFC-e ficam intactos.
