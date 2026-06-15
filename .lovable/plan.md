## Escopo

Adicionar botão **PIX** no `TefTestSaleCard` para cobrir o passo 11 do roteiro PayGo C6 ("Venda por QRCode para PIX e Carteiras Digitais"). O resto já está implementado.

## Mudança única

`src/components/tef-paygo/TefTestSaleCard.tsx`:
- Acrescentar terceiro botão **PIX** ao lado de Débito/Crédito, chamando `runSale("pix")`. O adapter PayGo já mapeia `pix → PIX_TEF` e exibe "Escaneie o QR Code no pinpad".
- Sem mudar parâmetros, sem novo endpoint, sem mexer no bridge.

## Fora de escopo

- Não toca em PGWebLib, agente, adapter, ou qualquer outro card.
- Não muda o fluxo de seleção DEMO/REDE (PIX sobe direto, sem prompt de rede).
