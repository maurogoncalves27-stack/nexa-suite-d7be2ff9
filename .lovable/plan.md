# Erro "Tipo de captura PayGo nao tratado. Tipo=0" no passo PIX C6 BANK

## Diagnóstico

O erro vem de `electron-acbr/scripts/paygo-bridge.ps1:520` (case `default` do `switch (data.bTipoDeDado)`).

No fluxo PIX (passo 11 - QR Code PIX C6 BANK):

1. A `PGWebLib.PW_iExecTransac` retorna um array `PW_GetData` com vários slots.
2. Um dos slots vem com `bTipoDeDado = 0`, `wIdentificador = 0x0` e `szPrompt` vazio — é um **slot vazio/sentinela** (PWDAT_NONE) que o SDK preenche quando o número real de capturas é menor que os 9 alocados.
3. Nosso `switch` não tem case para `0`, cai no `default` e dispara a exceção, abortando a venda **antes** de chegar no passo de exibição do QR Code (PWDAT_DSPQRCODE = 20).

Por isso o QR Code nunca aparece e o usuário só vê o toast vermelho.

Confirmações no código:
- `paygo-bridge.ps1:424`: `count = 9` (array fixo de 9 antes da chamada).
- `paygo-bridge.ps1:427`: `PW_iExecTransac(data, ref count)` devolve o `count` real, mas o `for` itera o `count` antigo na próxima volta — em alguns retornos do SDK, slots intermediários podem chegar zerados mesmo dentro do `count` informado.

## Mudanças propostas (apenas no bridge — NÃO mexer em agente, UI, iFood, fluxo TEF)

### 1. `electron-acbr/scripts/paygo-bridge.ps1`

**a) Adicionar tratamento explícito de slot vazio (Tipo=0) — `HandleData`, antes do `default`:**

```csharp
case 0: // PWDAT_NONE / slot vazio retornado pela DLL
    return PWRET_OK;
```

Isso faz o bridge ignorar o slot vazio em vez de abortar, mantendo o `default` para qualquer tipo realmente desconhecido (qualquer outro >0 continua lançando exceção, então não perdemos visibilidade).

**b) Logar o conteúdo do QR Code no evento de DSPQRCODE (linha 470-472):**

Trocar o `EmitEvent("INFO", "PayGo solicitou exibicao de QR Code")` por dois eventos:
- `EmitEvent("INFO", "PayGo solicitou exibicao de QR Code")` (mantido)
- `EmitEvent("QRCODE", data.szValorInicial ?? "")` — com o payload bruto do QR (BR Code Pix)

Isso não muda o protocolo (`PW_iAddParam` continua sendo chamado igual), apenas torna o conteúdo do QR observável no log/agente para a próxima etapa (renderização visual na UI).

### 2. Nada mais nesta rodada

- **Sem mudanças** no agente Electron (`acbr-tefd.cjs`), na UI (`TefTestSaleCard`, `SimulatedPrinter`, `TefPaygoSetup`), em iFood, em `pos_*` ou em qualquer outro módulo.
- A renderização gráfica do QR Code na tela do PDV/teste fica para um **plano seguinte**, depois de confirmarmos que o erro Tipo=0 sumiu e que o evento `QRCODE` chega ao agente com o payload correto.

## Como validar

1. Build do agente Electron (`electron-acbr`) e instalar a nova versão na máquina Windows.
2. Refazer o Passo 11 (QR Code PIX C6 BANK, R$ 1,50) em `/configuracoes/tef-paygo`.
3. Resultado esperado:
   - Não aparece mais o toast "Tipo de captura PayGo nao tratado. Tipo=0".
   - O fluxo segue para a leitura do QR pelo app DEMO PayGo (mesmo que o QR ainda não seja desenhado visualmente — esse passo virá no próximo plano).
   - `C:\PAYGOWEB\Log\comms_*.log` registra a transação PIX completa.
   - Nos logs do agente NEXA ACBr deve aparecer o evento `QRCODE` com o conteúdo BR Code.

## Riscos

Baixo. A mudança é aditiva (um case novo + um evento extra). O `default` continua existindo para qualquer outro tipo desconhecido real.
