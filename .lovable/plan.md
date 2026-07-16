## Objetivo

Alinhar o bridge PayGo (`electron-acbr/scripts/paygo-bridge.ps1`) ao fluxo operacional documentado pela Setis, eliminando o `PW_iPPAbort()` do caminho normal de venda. O `PW_iPPAbort` passa a ser tratado apenas como exceção (cancelamento pelo operador durante captura), nunca como etapa de finalização.

## Situação atual

Hoje o bridge chama `AbortPinpad()` (que executa `PW_iPPAbort`) em três pontos:

1. **Linha 334** — dentro do `ExecTransac` principal, quando retorna `PWRET_TIMEOUT` mas a mensagem contém "AUTORIZ".
2. **Linhas 700 e 706** — dentro do handler `PWDAT_PPREMCRD` (remoção do cartão), quando o `PinpadLoop` de remoção estoura timeout.
3. **Linha 1513** — dentro do próprio `PinpadLoop` ao estourar seu deadline interno.

O caso (2) é o que aparece nos logs (`PW_iPPAbort() <0>` imediatamente antes do `PW_iConfirmation`), porque o ciclo interno de remoção do cartão termina em timeout com a venda já autorizada, e o bridge força o abort para "soltar" o pinpad. Isso não é passo do fluxo documentado — o correto é deixar o `PW_iExecTransac` completar naturalmente e só então chamar `PW_iGetResult` + `PW_iConfirmation`.

## Mudanças

### 1. `electron-acbr/scripts/paygo-bridge.ps1` — caminho de venda (SALE)

- No handler `PWDAT_PPREMCRD` do `HandleData`:
  - Remover o `AbortPinpad()` da linha 706 (caso `PWRET_TIMEOUT && IsAuthorizedMessage`). Manter o `return BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT`, deixando o pinpad ser liberado naturalmente pelo `PW_iConfirmation` posterior.
  - Manter a linha 700 (`AbortPinpad` para operações administrativas), pois é fluxo de exceção fora da venda.
- No `ExecTransacLoop` (linha 334): remover o `AbortPinpad()` também, pelo mesmo motivo — a chamada seguinte de `PW_iConfirmation` já libera o pinpad. Manter o retorno `approved`.
- Ampliar `PAYGO_REMOVE_CARD_TIMEOUT_MS` default de 30 s para 60 s para reduzir a incidência do caminho de timeout na remoção do cartão (mantém override por env var).

### 2. `PinpadLoop` (linha 1513)

- Manter o `AbortPinpad()` **apenas** quando o loop principal (não-venda) estoura o deadline geral — cenário de exceção real. Não altera fluxo de venda porque, com a mudança acima, o SALE não cai nesse ramo.

### 3. Comentário/documentação inline

- Adicionar comentário no topo do `HandleData` explicando: "PW_iPPAbort não é etapa do fluxo operacional de venda. Só é chamado como exceção (cancelamento do operador ou timeout global fora de SALE). A liberação do pinpad após autorização acontece via PW_iConfirmation."

## Fora de escopo

- `PW_iPPAbort` continua disponível para o cancelamento manual pelo operador via `/tef/cancelar` (rota já existente) — é o "aborto excepcional" previsto na documentação.
- Fluxo administrativo (ADMIN) e limpeza de pendência não são alterados.
- Nenhum arquivo do frontend precisa mudar; o contrato do agente (endpoints, eventos SSE, JSON de retorno) permanece idêntico.
- Sem bump de versão do agente ainda — faço junto no próximo release quando você confirmar que o log ficou limpo.

## Verificação

1. Rodar uma venda aprovada com confirmação automática e conferir no `comms_*.log` que a sequência final é apenas `PW_iExecTransac … <0>` → `PW_iGetResult(...)` → `PW_iConfirmation(...) <0>`, sem `PW_iPPAbort()` no meio.
2. Rodar uma venda com confirmação manual e confirmar o mesmo padrão (sem `PW_iPPAbort` antes do `PW_iConfirmation` manual).
3. Rodar o teste de "queda de energia" (checkbox) e garantir que a pendência continua sendo detectada corretamente na próxima venda.
