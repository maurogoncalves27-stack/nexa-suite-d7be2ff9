## Plano: Finalizar Fases A, B e C (Cardápio Fábrica + Fatores de Conversão)

Como estoque/fichas ainda não estão em produção, podemos executar tudo de uma vez sem período de validação.

### Fase A — Consolidação Cardápio Fábrica ✅ (já feito na iteração anterior)
Manter como está: `/cardapio-fabrica` redireciona para `/produtos-fabrica?view=cardapio`, filtro "Visão" e coluna "No cardápio" com switch já funcionam.

### Fase B — Fatores de Conversão (concluir integrações pendentes)
1. **`RecipeIngredientsDialog`** — garantir que o toggle Cru/Pronto persista em `recipe_ingredients.ingredient_state` e mostre a "baixa real" convertida.
2. **`lib/recipeCost.ts`** — quando `ingredient_state='pronto'`, dividir quantidade pelo fator `preparo` do produto antes de multiplicar pelo custo unitário do insumo cru.
3. **`ReplenishmentSuggestion.tsx`** — ao calcular necessidade de reposição, converter consumo em pronto para consumo em cru usando `product_conversions` tipo `preparo`.
4. **`DfeNoteDialog.tsx` e `QuickCreateProductDialog.tsx`** — priorizar `product_conversions` tipo `compra` sobre `purchase_unit`/`pack_size` ao dar entrada de NF-e.
5. **`recipeBookPdf.ts`** — exibir fator de conversão no cabeçalho de ingredientes que usam estado "pronto".
6. **`ConversionFactors.tsx`** — revisar UX (busca, filtro por tipo, edição inline) e adicionar botão "Novo fator" com validação.

### Fase C — Depreciação imediata de `purchase_unit` / `pack_size`
Como não está em produção, remover direto (sem período read-only):
1. Migração: `DROP COLUMN` de `inventory_products.purchase_unit` e `inventory_products.pack_size` (após confirmar backfill 100% em `product_conversions`).
2. Remover referências no código: `ProductsFactory.tsx`, `InventoryProducts.tsx`, formulários de produto, `DfeNoteDialog`, `QuickCreateProductDialog`, `recipeBookPdf`, tipos gerados.
3. Substituir toda leitura desses campos por consulta a `product_conversions` (tipo `compra`, `is_default=true`).

### Detalhes técnicos
- Helper central `getConversionFactor(product_id, type)` em `src/lib/conversions.ts` retorna `{ from_qty, to_qty, from_unit, to_unit }` com cache por sessão.
- Fallback: se um produto não tem fator `compra`, assumir 1:1 e emitir warning no console (dev) para facilitar detecção de gaps pós-migração.
- Validação da migração: `SELECT COUNT(*) FROM inventory_products WHERE pack_size IS NOT NULL AND id NOT IN (SELECT product_id FROM product_conversions WHERE conversion_type='compra')` deve retornar 0 antes do DROP.

### Arquivos afetados
- Migração nova (backfill guard + DROP COLUMN)
- `src/lib/conversions.ts`, `src/lib/recipeCost.ts`, `src/lib/recipeBookPdf.ts`
- `src/components/recipes/RecipeIngredientsDialog.tsx`
- `src/components/dfe/DfeNoteDialog.tsx`, `src/components/products/QuickCreateProductDialog.tsx`
- `src/pages/ReplenishmentSuggestion.tsx`, `src/pages/ConversionFactors.tsx`, `src/pages/ProductsFactory.tsx`, `src/pages/InventoryProducts.tsx`
