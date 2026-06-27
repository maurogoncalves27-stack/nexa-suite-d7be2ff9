## Objetivo

Na análise IA do Relatório de Ocorrências, separar o que é responsabilidade do iFood/entregador (categoria **LOGISTICA**) do que é responsabilidade interna, mostrar o **% de impacto do iFood** no total, e focar as sugestões no que a operação consegue resolver.

## Mudanças

### `supabase/functions/analyze-occurrences-report/index.ts`

1. **Calcular o split iFood vs interno** antes de chamar a IA, somando `por_categoria` cujo nome seja `LOGISTICA` (terceiros / iFood) versus o resto (interno):
   - `total_ifood`, `total_interno`, `pct_ifood`
   - Mesmo split por loja (para mostrar que loja X tem 60% das ocorrências causadas pelo iFood, fora do nosso controle)

2. **Enviar esses números** ao prompt como bloco dedicado:
   ```
   IMPACTO IFOOD/ENTREGADOR (fora do nosso controle direto):
   - Total: X de Y (Z%)
   - Por loja: [{name, ifood, interno, pct_ifood}]
   ```

3. **Atualizar o system prompt** com regras:
   - LOGISTICA = problemas causados por entregador iFood (atraso, extravio, troca, não chega, etc.). É **fora do nosso controle operacional direto**.
   - O índice `per_10k` da loja crítica deve ser recalculado **apenas com ocorrências internas** quando possível, para não punir loja que sofre mais com iFood.
   - **Sugestões** devem focar 80% em ações internas (cozinha, montagem, estoque, infra, atendimento). Para LOGISTICA, sugerir apenas ações de mitigação realistas (reportar ao iFood, registrar com print, escalar gerência de praça, comunicar cliente proativamente) — nunca "treinar entregador" ou "melhorar entrega".

4. **Adicionar campo no schema da tool `diagnostico_executivo`**:
   ```ts
   impacto_ifood: {
     percentual: number,        // % do total causado por LOGISTICA
     observacao: string,        // 1 frase: "X% das ocorrências são da operação do iFood, fora do nosso controle direto"
     acoes_mitigacao: string[], // 2-3 ações realistas para reduzir impacto (ex: print da rota, escalar praça)
   }
   ```
   E manter `sugestoes` exclusivamente para o que é **acionável internamente**.

### `src/pages/OccurrencesReport.tsx`

5. Renderizar o novo bloco `impacto_ifood` no diálogo da análise, acima de "Causas principais":
   - Card destacado com ícone `Truck` (ou similar) mostrando o `%` e a `observação`
   - Lista de `acoes_mitigacao` como bullets
   - Separar visualmente "Sugestões internas" (o que a gente resolve) das ações de mitigação iFood

## Não muda

- Lógica de filtros, agregações no front, busca de faturamento — tudo permanece.
- Categoria `LOGISTICA` continua entrando no `por_categoria`/`top_ocorrencias` (só ganha tratamento dedicado no prompt).

## Pontos de atenção

- A categoria `PAGAMENTO` envolve maquininha (TEF/PayGo) — é interna nossa, fica em sugestões.
- `INFRAESTRUTURA` (energia, internet, água) é interna, mas algumas (concessionária) são fora de controle — IA decide pelo contexto.
- Não criar tabela nova, não mudar schema de banco.
