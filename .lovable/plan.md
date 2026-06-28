## Diagnóstico

Restam **24 "Outro"** ativos em `occurrence_alerts`. Olhando os relatos, eles caem em padrões claros que hoje não têm encaixe no catálogo:

| Padrão observado nos relatos | Ocorrência atual | Quantos |
|---|---|---|
| "Cliente alega pedido errado, conferido = OK" / "reclamação sem causa interna" | PROBLEMAS COM A QUALIDADE | ~9 |
| "Reclamação genérica de qualidade sem detalhe" ("problemas de qualidade", "qualidade") | PROBLEMAS COM A QUALIDADE | ~4 |
| "Erro de preparo/separação" (mandou item errado, trocou box, errei itens) | PROBLEMAS COM A QUALIDADE | ~4 |
| "Cliente solicitou cancelamento" | PROBLEMAS COM A QUALIDADE | ~2 |
| "Entregador não entregou item / extraviou" | FALTOU ITENS NO PEDIDO | ~2 |
| Sobra real sem encaixe | — | 3 |

## Mudanças

### 1. Adicionar subcategorias ao catálogo `occurrences.subcategory_options`

**PROBLEMAS COM A QUALIDADE DO PEDIDO** (COZINHA) — adicionar:
- `Cliente alega erro - conferido OK` (recusa de cliente sem causa interna comprovada)
- `Erro de preparo/separação` (erro interno, mas não é sabor/temperatura/ponto)
- `Reclamação genérica` (cliente reclama sem detalhar)
- `Cancelamento solicitado pelo cliente`

**FALTOU ITENS NO PEDIDO** (MONTAGEM) — adicionar:
- `Extravio pelo entregador` (item saiu da loja mas não chegou)
- `Item não especificado`

### 2. Reclassificar os alertas existentes via UPDATE

Match por palavras-chave no `note` (case-insensitive), só nos registros com `subcategory='Outro'`:

| Regex no `note` | Nova subcategoria |
|---|---|
| `(alega|alegou).*(errad|pedid)` + `(conferid|tudo certo|enviado correct|SIM)` | `Cliente alega erro - conferido OK` |
| `(errei|errado.*preparo|preparado incorret|separação|enviou.*errad|trocou.*box|3 box.*galinhad)` | `Erro de preparo/separação` |
| `(solicitação de cancelamento|cliente.*cancel|pediu.*cancel)` | `Cancelamento solicitado pelo cliente` |
| `(entregador.*não entreg|extravi|não chegou completo|sumiu)` em FALTOU ITENS | `Extravio pelo entregador` |
| `^(problemas? (com a |de )?qualidade|qualidade)\.?$` (sem mais detalhe) | `Reclamação genérica` |

Tudo idempotente: só atualiza onde `subcategory='Outro'`.

### 3. Atualizar prompt da IA em `analyze-occurrences-report/index.ts`

Adicionar regra explícita:
- "Quando subcategoria for `Cliente alega erro - conferido OK`, **NÃO** trate como falha interna — é recusa de cliente sem causa comprovada. Mencione em `padroes` como sinal de cliente recorrente ou comunicação, não como problema operacional."
- "Quando subcategoria for `Extravio pelo entregador` (mesmo em FALTOU ITENS), conte como impacto iFood, não como erro interno de montagem."

## Não muda

- Schema de tabelas (só `UPDATE` em `occurrences.subcategory_options` + `occurrence_alerts.subcategory`).
- UI do relatório / filtros / agregação.
- Os 3 casos verdadeiramente "Outro" (sem padrão claro) ficam como estão.

## Resultado esperado

- "Outro" cai de **24 → ~3** (-87%).
- IA para de listar "Outro" como causa-raiz na análise.
- "Cliente alega erro - conferido OK" vira sinal próprio (não contamina mais o índice de erros internos).
- "Extravio pelo entregador" é contabilizado no `impacto_ifood`, mesmo estando em FALTOU ITENS.
