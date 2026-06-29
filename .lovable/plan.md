## Contexto

Hoje as fichas da fábrica (`/fichas-fabrica` → `RecipesFactory.tsx`) reutilizam o `RecipeFormCard` e ainda exibem:

- "Marcas que usam esta ficha" (chips FÁBRICA, AQUELA PARMÊ, BOX CAIPIRA, ESTROGONOFE)
- "Itens do cardápio que usam esta ficha" + botão "Vincular item"

Isso não faz sentido: a fábrica não tem cardápio. As fichas da fábrica geram **porções (output_product)** que são transferidas às lojas via Solicitações da Fábrica (`factory_requests`). O vínculo com cardápio só existe nas fichas das lojas.

## O que mudar

### 1. `src/components/recipes/RecipeFormCard.tsx`
- Adicionar prop `factoryMode?: boolean`.
- Quando `factoryMode` está ligado:
  - Ocultar bloco "Marcas que usam esta ficha" (chips + switches de marca).
  - Ocultar `<RecipeMenuItemsSection />` (cardápio).
  - Manter (e dar destaque a) o bloco que define o **produto de saída** (`output_product_id`) — é a porção que a fábrica produz e transfere às lojas.
  - No cabeçalho/resumo da ficha, trocar a frase atual por algo como: "Esta ficha produz **{output_product.name}** ({yield_quantity} {yield_unit}). As porções geradas são transferidas às lojas via Solicitações da Fábrica."
  - No salvar (`handleSave`): forçar `scope = 'fabrica'` e não gravar nada em `recipe_brands` nem em `menu_item` para esta ficha.

### 2. `src/pages/RecipesFactory.tsx`
- Passar `factoryMode` no `RecipeFormCard` (tanto no card de criação quanto na lista).
- Remover o filtro/seletor "Prato pronto vs Pré-preparo" (lá também não faz sentido — toda ficha da fábrica gera porção).
- Atualizar copy do header: "Fichas técnicas da fábrica — cada ficha gera uma porção que é transferida às lojas."

### 3. Limpeza de dados (migração leve, opcional)
Para fichas com `scope = 'fabrica'`:
- Remover linhas em `recipe_brands` (não fazem sentido — fábrica não é marca de venda).
- Garantir que nenhuma ficha de fábrica esteja referenciada como `recipe_id` em `pos_item_mappings` ou em vínculos de menu items das lojas. Apenas reportar contagem, sem apagar nada das lojas.

### 4. Fix de build pendente
O build reclamou de `Recipes.tsx(192,2)`. O arquivo atual já está bem-formado (terminação `};\nexport default Recipes;`), provavelmente é cache. Vou refazer um save trivial no arquivo para forçar nova transformação durante a implementação; se persistir, conferir parênteses do JSX em volta dos botões de filtro removidos.

## Fora de escopo
- Não alterar nada nas fichas das lojas (`/fichas` → `Recipes.tsx`) além do que já foi feito.
- Não mexer em `factory_requests` / fluxo de transferência — só ajustar a UI da ficha para refletir esse modelo.
- Não tocar em `pos_item_mappings`, `recipe_book_entries` ou outros vínculos das lojas.

## Arquivos afetados
- `src/components/recipes/RecipeFormCard.tsx` (prop `factoryMode`, esconder marcas e cardápio, copy)
- `src/pages/RecipesFactory.tsx` (passar prop, remover filtros desnecessários, copy)
- Migração SQL pequena para limpar `recipe_brands` de fichas com `scope = 'fabrica'`
