## Objetivo
Separar fichas técnicas da Fábrica das fichas das lojas: criar página dedicada **/fichas-fabrica** no submenu **Fábrica** do sidebar, mantendo `/fichas-tecnicas` apenas para fichas de loja.

## Mudanças

### 1. Nova página `src/pages/RecipesFactory.tsx`
- Reaproveita a estrutura atual de `src/pages/Recipes.tsx`, mas:
  - Remove as abas de marca (não há tab de marca; é sempre Fábrica).
  - Lista apenas fichas com `scope = 'fabrica'` OU vinculadas à brand FÁBRICA.
  - Mantém os dois filtros: **Pré-preparo** e **Prato pronto** (mesma semântica de hoje aplicada apenas dentro do universo Fábrica).
  - Criação/edição via `RecipeFormCard` já vinculada à brand FÁBRICA e `scope = 'fabrica'`.
- Cabeçalho padrão com ícone do item do sidebar (ChefHat/ClipboardList — mesmo ícone usado no submenu).

### 2. `src/pages/Recipes.tsx` (página de loja)
- Remove do universo as fichas de fábrica: passa a filtrar `scope <> 'fabrica'` e ignorar a brand FÁBRICA por completo.
- Remove a aba/tab "FÁBRICA" da barra de marcas.
- Mantém filtros Pré-preparo / Prato pronto apenas para fichas de loja (pré-preparo de loja = ingrediente intermediário que vira componente de outra ficha da própria loja).

### 3. Sidebar `src/components/AppSidebar.tsx`
- Adicionar item em `fabricaSections`:
  ```
  { title: "Fichas técnicas", url: "/fichas-fabrica", icon: ChefHat, staffOnly: true }
  ```
- Atualizar `fabricaItems` (automático via flatMap).

### 4. Rota em `src/App.tsx`
- Registrar `/fichas-fabrica` → `RecipesFactory`.

### 5. `src/components/AppLayout.tsx`
- Acrescentar entrada em `PAGE_TITLES` para `/fichas-fabrica` ("Fábrica › Fichas técnicas").

## Fora de escopo
- Não altera schema (tabela `recipes`/coluna `scope` já existe).
- Não mexe em receituário, ficha de PDV, mapeamentos POS.
- Não toca em estoque, produção ou requisições.

## Confirmações que preciso
1. O ícone do novo item no submenu Fábrica deve ser **ChefHat** (mesmo de Fichas técnicas hoje)? Ou prefere outro?
2. Confirma que a página atual `/fichas-tecnicas` deve **deixar de mostrar qualquer ficha da Fábrica** (inclusive a aba "FÁBRICA" some)?
