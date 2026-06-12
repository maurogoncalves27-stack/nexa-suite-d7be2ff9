
## O que vamos fazer

A demo do seu amigo (`integracao_tef_paygo`) tem uma arquitetura **completamente diferente** da nossa para falar com o pinpad. Vamos trocar o nosso motor pelo dele, preservando 100% do resto do sistema (UI, banco, iFood, NFC-e, etc).

### Por que a do amigo funciona e a nossa trava

| | Nosso agente hoje | Demo do amigo |
|---|---|---|
| Como chama a DLL | `node-ffi-napi` (Node x64) | PowerShell compila C# em memória e usa `P/Invoke` |
| Tipo de processo | Node único | Node + "host" PowerShell persistente que processa comandos JSON |
| Loop de eventos do pinpad | Implementado a mão no JS | Implementado dentro do C# (igual aos exemplos oficiais Setis) |
| Resultado prático | Trava em "Iniciando…" e dá timeout | Acende o pinpad, processa cartão, retorna NSU |

A diferença é estrutural — não é parâmetro que conserta. Por isso "ajustar o nosso" não resolve.

## Plano de execução

### 1. Trazer o bridge PowerShell do amigo
- Copiar `scripts/paygo-bridge.ps1` (1052 linhas, é o coração) para `electron-acbr/scripts/paygo-bridge.ps1`.
- Esse arquivo é o que carrega a `PGWebLib.dll`, faz `PW_iInit`, `PW_iNewTransac`, `PW_iExecTransac`, `PW_iPPEventLoop`, etc.
- Ele aceita as ações: `commtest`, `admin`, `install`, `sale`, `confirm`, `undo`, `host`.
- **Nenhuma alteração de conteúdo** — copiamos na íntegra para não introduzir bug.

### 2. Reescrever o adapter do agente Node
- Trocar `electron-acbr/acbr-tefd.cjs` por um adapter inspirado em `RealPayGoTefAdapter.ts` do amigo.
- Em vez de `ffi-napi.Library(...)`, o agente vai `spawn('powershell.exe', ['-File','paygo-bridge.ps1','-Action','host', ...])` e conversar via JSON pelo stdin/stdout.
- Mantém os mesmos endpoints HTTP que a nossa UI já chama (`/tef/admin`, `/tef/status`, `/tef/sale`, `/tef/confirm`, `/tef/undo`, `/tef/health`).

### 3. Defaults travados no nosso PdC
- O bridge aceita `-PontoDeCaptura`, `-CpfCnpj`, `-SenhaTecnica`, `-Ambiente`, `-PinpadPort` via argumento.
- O agente vai sempre passar:
  - `PontoDeCaptura = 111476`
  - `CpfCnpj = 44932369000108`
  - `SenhaTecnica = 314159`
  - `Ambiente = DEMO`
  - `PinpadPort = 5` (da config da loja)
- Esses defaults também ficam disponíveis em variáveis de ambiente caso o usuário queira sobrescrever.

### 4. Limpar o que está obsoleto
- Remover do agente: `ffi-napi`, `ref-napi`, `ref-struct-di` (não vamos mais usar).
- Remover funções `PW_iInit/PW_iPPEventLoop` implementadas a mão em JS — agora isso vive no PS/C#.
- Manter NFC-e (`electron-acbr/acbr-nfe.cjs`) e o server HTTP intactos.

### 5. UI fica igual
- `/configuracoes/tef-paygo` continua igual: botões "Inicializar TEF", "Abrir menu ADM", "Testar comunicação", "Testar porta", "Diagnosticar agente".
- Os fluxos de captura (menu/teclado) já existentes no `TefPinpadSetupCard.tsx` continuam funcionando porque o PS bridge emite os mesmos eventos de `PW_GetData`.

### 6. Como testar (passo a passo na sua máquina)
1. `cd C:\Users\Mauro\Documents\GitHub\nexa-suite-d7be2ff9\electron-acbr`
2. `git pull` (puxa o bridge novo)
3. `npm install` (vai remover ffi-napi e ref-napi automaticamente)
4. `npm start` (abre o agente)
5. No app: `/configuracoes/tef-paygo` → "Inicializar TEF" → deve voltar `ok:true`
6. Botão **"Testar comunicação"** → pinpad acende, mostra menu, escolhe "Teste de Comunicação", volta NSU de teste.

## Detalhes técnicos (pode pular se quiser)

- O "host" PowerShell roda em loop lendo linhas JSON do stdin no formato `{"id":"...","action":"sale","amountInCents":1000,...}` e respondendo no stdout com `{"id":"...","payload":{...},"event":{...}}`.
- O C# in-memory faz `LoadLibrary("PGWebLib.dll")` + `GetProcAddress` para cada função (`PW_iInit`, `PW_iNewTransac`, `PW_iAddParam`, `PW_iExecTransac`, `PW_iGetResult`, `PW_iConfirmation`, `PW_iPPEventLoop`, `PW_iPPAbort`, `PW_iPPGetCard`, `PW_iPPGetPIN`, `PW_iPPGetData`, `PW_iPPGoOnChip`, `PW_iPPFinishChip`, `PW_iPPConfirmData`, `PW_iPPRemoveCard`, `PW_iPPGenericCMD`, `PW_iPPPositiveConfirmation`, `PW_iPPTestKey`).
- Os códigos de retorno PayGo (`PWRET_OK=0`, `PWRET_TIMEOUT=-2490`, `PWRET_PPNOTFOUND=-2489`, etc.) ficam no arquivo `paygoReturnCodes.ts` portado do amigo.
- Como o C# roda dentro do PowerShell (que é nativo x64 no Windows), ele acessa a DLL x64 sem o "vai com 32, não vai com 64" que estraga o `ffi-napi`.

## O que NÃO muda
- iFood (em produção, intocável)
- NFC-e
- Toda a UI do app
- Banco/RLS
- Garçom / PDV / Totem

## Risco
- **Baixo no app**: zero mudança de schema, zero mudança de rota visível.
- **Médio no agente Electron**: substitui o adapter inteiro. Se der ruim, basta voltar `acbr-tefd.cjs` da versão anterior via git revert.

## Tempo estimado
- 1 sessão de chat para portar tudo e gerar release `electron-acbr v1.x` pronto pra você instalar.
