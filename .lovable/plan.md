## Objetivo
Deixar uma transação **aprovada pela PayGo mas não confirmada** (estado `PWINFO_PNDREQNUM` preenchido na DLL) — simulando uma queda de energia entre a aprovação e o `PW_iConfirmation`.

## Contexto
Hoje o fluxo, com "Confirmação manual" desmarcada, chama `PW_iConfirmation(CNF_AUTO)` logo após a aprovação. Com "Confirmação manual" marcada, a confirmação só acontece quando o operador clica no modal. Para simular queda, precisamos **matar o processo entre esses dois momentos**, sem chamar `confirm` nem `undo`.

## Opções recomendadas (da mais realista para a mais rápida)

### Opção A — Kill do agente durante venda com confirmação manual (mais fiel)
1. Em `/configuracoes/tef-paygo`, marcar **"Confirmação manual de venda"**.
2. Iniciar uma venda pequena (R$ 1,00, débito ou Pix DEMO).
3. Aguardar a PayGo retornar aprovado — o modal de confirmação manual aparece na UI.
4. **Antes de clicar em Confirmar/Desfazer**, no PC do agente:
   - Task Manager → finalizar `NEXA ACBr Agent.exe` (End task, não Close), **ou**
   - PowerShell: `Stop-Process -Name "NEXA ACBr Agent" -Force` (ou `taskkill /F /IM "NEXA ACBr Agent.exe"`), **ou**
   - Se quiser simular queda de luz "de verdade": desligar o PC pelo botão físico (hold 5s) ou tirar da tomada.
5. Reabrir o agente → a DLL da PayGo mantém `PWINFO_PNDREQNUM` preenchido no arquivo de estado local dela.
6. Recarregar `/configuracoes/tef-paygo` → o `useEffect` inicial vai chamar `/api/tef/pending` e abrir o modal.

Vantagem: reproduz exatamente o cenário "sem CNF_AUTO nem CNF_REV". É o teste que valida a checagem inicial de pendência.

### Opção B — Adicionar botão oculto "Simular queda" (dev-only)
Botão no `TefTestSaleCard` (visível só com `?debug=1` na URL ou super-user) que:
- Envia venda normal com `manualConfirmation=true`.
- Quando o agente retorna aprovado, o front **não abre o modal** e **não chama** `/tef/confirm` — apenas mostra "Simulação: transação pendente na DLL".
- Estado idêntico ao da queda real, sem precisar matar processo.

Vantagem: repetível, sem risco de corromper log. Desvantagem: precisa de código novo (só faz sentido se você for testar isso várias vezes).

### Opção C — Endpoint `/tef/simular-pendencia` no agente
Rota nova em `acbr-tefd.cjs` que roda `PW_iNewTransac(SALE)` + captura interativa até aprovação e **retorna sem chamar `PW_iConfirmation`**, deixando o `PWINFO_PNDREQNUM` vivo na DLL. Reproduz queda sem matar processo e sem depender do front.

## Recomendação
**Comece pela Opção A** — é zero código, usa exatamente o fluxo que você quer validar (checagem inicial + modal), e o `taskkill /F` reproduz fielmente a queda de energia do ponto de vista da PayGo (nem CNF nem REV chegam à DLL). Só passe para B/C se precisar rodar o teste dezenas de vezes.

## Comando pronto pra colar no PC do agente
```powershell
taskkill /F /IM "NEXA ACBr Agent.exe"
```
Rodar imediatamente após ver o modal de confirmação manual aparecer na tela.

## Depois do teste
Ao reabrir a página, o modal deve abrir automaticamente com o `reqNum` da venda. Aí você valida os dois caminhos:
- **Confirmar** → `PW_iConfirmation(CNF_AUTO)` → pendência sai.
- **Desfazer** → `PW_iConfirmation(REV_MANU_AUT)` → pendência sai e venda é estornada.
