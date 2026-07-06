## Objetivo
Incluir a FABRICA no gráfico de consumo da página `/consumo-lojas`, trocando a métrica de "% do faturamento" por "valor consumido (R$)".

## Por que funciona
Hoje o gráfico é `custo / faturamento * 100`. Como FABRICA não tem faturamento próprio (compartilha espaço físico com Asa Sul), o denominador é 0 e as barras zeram. Se o eixo passar a ser R$ absolutos, FABRICA aparece normalmente com seus custos rateados (água/luz 50% de Asa Sul + gás/botijões próprios).

## Mudanças em `src/pages/ConsumoLojas.tsx`

1. **`chartData`**: remover o filtro que exclui FABRICA e trocar os campos de `%` por valores em R$:
   - `"Água"`: `r.aguaValor`
   - `"Luz"`: `r.luzValor`
   - `"Gás"`: `r.gasValor`
   - `"Trocas de óleo"`: `r.oleoTrocas` (continua no eixo direito, contagem)

2. **`<BarChart>`**:
   - Título do card muda de "% do faturamento por insumo" para "Consumo por loja (R$)".
   - Eixo Y esquerdo passa a formatar em R$ (usar `brl` compacto, ex.: `R$ 1,2k`) em vez de `%`.
   - Tooltip formata R$ para Água/Luz/Gás e número inteiro para Trocas.
   - `dataKey` das `<Bar>` passa a ser `"Água"`, `"Luz"`, `"Gás"`, `"Trocas de óleo"` (cores mantidas).

3. **Toggle `R$ / % do faturamento`** da tabela: mantido como está — só afeta a tabela, não o gráfico.

## Fora de escopo
- Não mexer em cálculo de rateio (já está 50/50 água/luz entre Asa Sul e FABRICA).
- Não mexer em cores das lojas nem na tabela.
- Não tocar em outras páginas.
