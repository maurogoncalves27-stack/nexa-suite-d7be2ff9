# Insumos da ficha técnica de loja: itens do CD e bebidas

## Problema

O estoque já está correto: produtos produzidos no CD chegam às lojas e aparecem em `inventory_stock` da loja (ex.: 114 Norte tem CARNE DE SOL, CROQUETE, MOLHO ALHO E ÓLEO etc.). O problema é apenas o **seletor de itens da ficha técnica de loja**, que filtra demais:

1. Itens produzidos/expedidos pelo CD estão marcados como `factory_only`, e o seletor de ficha de loja mostra somente itens com `factory_only = false`. Resultado: nada vindo do CD aparece como insumo da loja.
2. Bebidas estão classificadas com papel de uso `venda_loja` (revenda). O seletor só aceita `insumo_producao` ou `insumo_montagem`, então nenhuma bebida aparece — inviabilizando combos que incluem refrigerante/cerveja.

## O que muda (somente UI do seletor)

No diálogo de ingredientes da ficha técnica, quando o contexto é **loja**, o seletor passa a ter grupos:

- **Pré-preparos / Fichas** (como hoje)
- **Produzidos no CD** — itens `factory_only` / com papel `venda_fabrica`, que a loja recebe por transferência
- **Insumos / Produtos** (como hoje)
- **Bebidas / Revenda** — itens com papel `venda_loja` (bebidas e similares)
- **Embalagens / Descartáveis** (como hoje, no bloco de embalagens)

No contexto **CD/fábrica** nada muda.

Cada grupo com busca por nome e rótulo visual curto, para não virar uma lista gigante única.

## Detalhes técnicos

- Arquivo: `src/components/recipes/RecipeIngredientsDialog.tsx`.
- Substituir o filtro atual `contextScope === "fabrica" ? p.factory_only : !p.factory_only` por uma classificação em buckets quando `contextScope === "loja"`:
  - `cd`: `p.factory_only === true` ou `usage_roles` contém `venda_fabrica`
  - `revenda`: `usage_roles` contém `venda_loja` e não contém `insumo_*`
  - `insumo`: demais (regra atual de `insumo_producao` / `insumo_montagem` / legado sem papéis)
- Embalagens continuam separadas pela categoria (`/embalag/i`) e só no bloco de embalagens.
- Custo/`average_cost`, unidades, estado cru/pronto e a gravação em `recipe_ingredients` seguem iguais — nenhuma mudança de schema, de baixa de estoque ou de transferência CD → loja.

## Fora do escopo

- Alterar `usage_roles` ou `factory_only` no cadastro dos produtos (a classificação atual continua válida).
- Mudar o fluxo de transferência/recebimento do CD, que já registra o saldo na loja.
