## Escolhas confirmadas
1. **Cardápio da Fábrica** consolidado em `/produtos-fabrica` como visão filtrada.
2. **Cru ↔ pronto** = fator no produto (um único cadastro; a ficha declara se usa cru ou pronto).

---

## Fase A — Consolidar Cardápio

- `/cardapio-fabrica` vira redirect → `/produtos-fabrica?view=cardapio`.
- Em `/produtos-fabrica`:
  - Filtro "Visão": Todos · Cardápio · Só insumos · Só produzidos (lê `?view=` da URL).
  - Nova coluna **No cardápio** com switch que liga/desliga o papel `venda_fabrica` em `usage_roles`.
- Sidebar mantém o link "Cardápio da fábrica" apontando para `/produtos-fabrica?view=cardapio`.
- Redirect também em `AppLayout` PAGE_TITLES.

## Fase B — Fatores de conversão

### B.1 Migração

Nova tabela `public.product_conversions`:

```
id · product_id (FK inventory_products) · conversion_type ('compra'|'preparo'|'porcionamento')
· from_unit · from_qty numeric · to_unit · to_qty numeric
· notes · is_default bool · created_at · updated_at
```

- GRANTs para `authenticated` e `service_role`, RLS: leitura para authenticated, escrita para admin/manager (via `has_role`).
- Índice `(product_id, conversion_type)` + único em `(product_id, from_unit, to_unit, conversion_type)`.
- Trigger `updated_at`.
- **Backfill**:
  - Para cada produto com `purchase_unit` e `pack_size > 0` → linha `compra` (1 `purchase_unit` = `pack_size` `unit`, `is_default=true`).
  - Para cada `recipes` com `output_product_id` e insumo principal identificável → linha `preparo` cru→pronto (fator = `yield_quantity / input_base`). Onde não for possível derivar automaticamente, deixar para cadastro manual.
- Coluna `recipe_ingredients.ingredient_state text` (`cru`|`pronto`|null), default null.

### B.2 Página `/fatores-conversao`

- Item de sidebar em **Estoque › Cadastros** (ícone `Ruler` ou `Scale`).
- Lista de produtos com contagem de conversões por tipo; badge alerta em produtos sem nenhuma conversão.
- Filtros: busca, tipo, "sem conversão", categoria.
- Editor inline por produto: adicionar/remover linhas, marcar `is_default`, notas.
- Cabeçalho segue padrão obrigatório (h1 + ícone `text-primary` igual ao do sidebar).

### B.3 Consumo pelo sistema

- `src/lib/conversions.ts` com helpers: `getConversions(productId)`, `resolveFactor(productId, fromUnit, toUnit, type?)`, `toBaseQty(productId, qty, unit)`.
- **Editor de ficha** (`RecipeIngredientsDialog`): se o ingrediente tiver conversão `preparo`, mostra toggle **Cru / Pronto**; grava `ingredient_state`. Cálculo de custo sempre no cru (baixa real de estoque).
- **Custo da ficha** (`recipeCost.ts`): quando `ingredient_state='pronto'`, divide qty pelo fator antes de multiplicar pelo custo unitário.
- **Sugestão de abastecimento** (`ReplenishmentSuggestion`): converte "3 kg cozido" em "1,2 kg cru" quando o produto tem `preparo` e o consumo é de item cozido.
- **Recebimento DFe** (`DfeNoteDialog`, `QuickCreateProductDialog`): passa a olhar `product_conversions` tipo `compra` (por produto) antes do `pack_size` legado. `dfe_supplier_unit_conversion` continua sendo o "override por fornecedor".
- **Receituário PDF** (`recipeBookPdf`): exibe fator cru→pronto no cabeçalho quando existir.

## Fase C — Descontinuar duplicidade

- Após validação (1-2 semanas), `purchase_unit`/`pack_size` na ficha do produto ficam **read-only** com aviso "editar em Fatores de Conversão".
- Remoção final em release posterior.

---

## Detalhes técnicos

- Nenhum dado se perde: backfill preserva `purchase_unit`/`pack_size` e fichas de pré-preparo existentes.
- Compatível com `infinite_stock` (fator irrelevante), modelo de 3 eixos (`stock_scope`/`usage_roles`/`production_flow`) e páginas já entregues.
- Arquivos afetados:
  - `src/App.tsx` (nova rota + redirect), `src/components/AppSidebar.tsx`, `src/components/AppLayout.tsx`.
  - `src/pages/ProductsFactory.tsx`, remover uso principal de `src/pages/FactoryMenu.tsx` (mantido só como redirect até 1 release).
  - Novo `src/pages/ConversionFactors.tsx`, novo `src/lib/conversions.ts`.
  - `src/components/recipes/RecipeIngredientsDialog.tsx`, `src/lib/recipeCost.ts`, `src/lib/recipeBookPdf.ts`.
  - `src/pages/ReplenishmentSuggestion.tsx`, `src/components/inventory/DfeNoteDialog.tsx`, `src/components/inventory/QuickCreateProductDialog.tsx`.

Faseamento executado nesta ordem: A → B.1 (migração) → B.2 (página) → B.3 (integrações).
