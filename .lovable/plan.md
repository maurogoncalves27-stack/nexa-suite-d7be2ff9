## Objetivo

1. **Combo de loja**: criar uma ficha técnica "combo" juntando 2+ fichas existentes em poucos cliques (ex.: Parmegiana + Churros).
2. **Pré-preparo dentro do prato pronto**: permitir adicionar uma ficha de pré-preparo como ingrediente de uma ficha de prato pronto (fábrica), com custo somado automaticamente.

Hoje o `recipeCost.ts` já calcula custo recursivamente quando um ingrediente é um produto "produzido" por outra ficha — falta apenas UX para selecionar fichas como item, e um atalho para combos.

---

## Mudanças

### 1. Selecionar "ficha" como ingrediente (resolve item 2)

Em `src/components/recipes/RecipeIngredientsDialog.tsx`:
- Carregar, além de `inventory_products`, a lista de receitas que têm `output_product_id` (são "fichas que viram produto").
- No `<Select>` de produto, agrupar em duas seções:
  - **Insumos / Produtos** (atual)
  - **Pré-preparos / Fichas** — lista as receitas pelo nome, mas o `value` continua sendo o `output_product_id` (mantém schema atual, sem migration).
- Ao escolher uma ficha, sugerir `unit = yield_unit` da ficha e `quantity = 1`.
- O custo já é calculado pela média do `inventory_product` produzido; quem produz a ficha alimenta esse custo via "Produzir" — comportamento atual preservado.

### 2. Novo botão "Combo" na página de Fichas da loja

Em `src/pages/Recipes.tsx`, junto ao botão "Nova ficha":
- Botão **"Novo combo"** abre um diálogo novo `CombooRecipeDialog.tsx`.

`src/components/recipes/ComboRecipeDialog.tsx` (novo, ~120 linhas):
- Campos: nome do combo, marca (pré-selecionada pela aba ativa), seletor múltiplo de **2 ou mais fichas existentes** (filtrado por marca da aba, exclui fábrica), quantidade por ficha (default 1).
- Ao salvar:
  1. `INSERT` em `recipes` (`yield_quantity=1`, `yield_unit='UN'`, `scope='loja'`, `category='combo'`, sem `output_product_id`).
  2. `INSERT` em `recipe_brands` ligando à marca.
  3. `INSERT` em `recipe_ingredients` — uma linha por ficha selecionada, usando o `output_product_id` da ficha como `product_id`, `quantity` informada, `unit` = `yield_unit` da ficha de origem.
- Recarrega lista e abre o card recém-criado para ajustes finos.

### 3. Indicação visual

No `RecipeFormCard` e no select de ingredientes, marcar linhas que vêm de outra ficha com um badge "ficha" (usando `inventory_products.product_type === 'produzido'`) para o usuário ver claramente que é um sub-produto.

---

## Não muda

- Schema do banco (nenhuma migration).
- `recipeCost.ts` (já suporta recursão até 6 níveis).
- Página `RecipesFactory.tsx` — só ganha o mesmo seletor agrupado de ingredientes via o componente compartilhado.
- Receituário / `recipe_books` — intocado.

## Detalhes técnicos

- Apenas fichas **ativas** com `output_product_id != null` aparecem como opção de ingrediente (uma ficha sem produto de saída não tem custo unitário).
- Para evitar loop, o seletor exclui a própria receita sendo editada.
- Combo criado sem `output_product_id` (não vira produto vendável de estoque) — é só uma agregação de fichas para custo/cardápio.
