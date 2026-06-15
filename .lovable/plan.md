# Roteiro de Testes PayGo C6 — versão completa

Substituir o card atual (`src/components/tef-paygo/TefRoteiroTestesCard.tsx`), que tem só 9 itens genéricos, por um roteiro fiel ao **Roteiro de testes v20241216** + **Planilha de testes v20240306** da PayGo. Foco em Biblioteca Windows (PGWebLib.dll), que é o nosso modo de integração.

## O que muda

- 54 passos numerados (Passo 01 → Passo 54), na ordem oficial.
- Cada passo mostra: número, badge `OBRIGATÓRIO` / `OPCIONAL` / `SE AUTOATENDIMENTO`, título, breve descrição do procedimento e do resultado esperado.
- Agrupado em seções colapsáveis (Accordion) para não estourar a tela:
  1. Instalação e vendas básicas (1–8)
  2. Recibos e QR Code PIX C6 (9–11)
  3. Comunicação e relatórios (12–16)
  4. Cancelamentos (17–23)
  5. Quedas de energia (24–25)
  6. Dado genérico / menu genérico / mensagem máxima (26–30)
  7. Transação pendente e confirmação (31–36)
  8. Desfazimento (37–38)
  9. Autoatendimento (39–40, só obrigatório se PDV em modo totem)
  10. Cancelamento por referência (41–44)
  11. Contactless / aproximação (45–46)
  12. ControlPay (47–50, só obrigatório se usar Web Service — no nosso caso ficam opcionais)
  13. Queda de energia pós-aprovação + QR Code finais (51–54)
- Checkbox por passo + estado de "N/A" para os opcionais que não se aplicam.
- Persistência local em `localStorage` (chave `tef-paygo-roteiro-v20241216`) para não perder progresso ao recarregar.
- Barra de progresso topo do card: `X de Y obrigatórios concluídos`.
- Botão "Resetar" mantido; novo botão "Exportar checklist" que baixa um `.txt` com status de cada passo (útil para enviar à PayGo na homologação).

## Arquivos

- **edit** `src/components/tef-paygo/TefRoteiroTestesCard.tsx` — reescrever com a lista completa, accordion por seção, persistência e progresso.
- Sem mudanças em `TefPaygoSetup.tsx` (o card continua renderizado no mesmo lugar).
- Sem mudanças de banco/edge function — estado fica em `localStorage`.

## Fonte dos dados

Lista de 54 passos derivada da **Planilha de testes v20240306** (coluna Obrigatoriedade) cruzada com os títulos/descrições do **PDF Roteiro v20241216**. Conteúdo fica hardcoded no componente como um array `ROTEIRO: { n, obrig, secao, titulo, desc }[]` — sem depender de fetch.
