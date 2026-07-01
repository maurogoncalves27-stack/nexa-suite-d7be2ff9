## Diagnóstico da situação atual

**O que temos hoje no banco (277 produtos ativos, 6 lojas físicas + Escritório):**

| Tipo         | Total | `factory_only` | `is_internal` |
| ------------ | ----- | -------------- | ------------- |
| insumo       | 212   | 53             | 66            |
| revenda      | 26    | 0              | 0             |
| produzido    | 26    | 14             | 14            |
| personalizado| 8     | 0              | 0             |
| embalagem    | 5     | 5              | 0             |

- 659 vínculos em `product_store_links` (produto ↔ loja "sugerida").
- 1.239 linhas em `inventory_stock` — **todo produto aparece em toda loja** (205 em cada loja + 214 no Estoque Central). Isso gera ruído: refri aparece na Fábrica, farinha aparece no PDV, etc.
- 102 fichas técnicas (`recipes`), 82 itens de cardápio (`menu_items`).
- Fluxo Fábrica→Loja hoje usa `factory_requests` (8 pedidos) e `inventory_transfers` (1). Recebimento entra tudo no **Estoque Central**.

**Problemas que isso está causando (e você já sentiu):**

1. **Cardápio da fábrica poluído** — aparece pré-preparo/insumo porque não há regra clara do que é "vendável" vs "insumo de produção".
2. **Duplicidade e itens no lugar errado** — o mesmo item tem versão fábrica e versão loja, e o filtro atual é uma flag frágil (`factory_only`) sem contrapartida "loja_only" nem "compartilhado".
3. **Saldo de estoque inflado** — cada produto aparece em todas as lojas mesmo quando não faz sentido (refri no Estoque Central da Fábrica, farinha na loja).
4. **Não fica claro quem consome o quê** — insumo que a fábrica usa pra produzir X e insumo que a loja usa pra montar prato Y estão misturados no mesmo balde.
5. **Fluxo Estoque Central → Fábrica → Loja não é explícito** — hoje é "tudo em todo lugar" e a movimentação depende de contagem, não de regra.

---

## Proposta: modelo de 3 eixos (escopo · uso · fluxo)

Em vez de flags soltas, cada produto passa a ter **3 atributos claros**:

### 1) `stock_scope` — onde o produto pode ter estoque
- `central` — só Estoque Central (ex.: chega da nota fiscal e é redistribuído; nunca aparece em contagem de loja).
- `factory` — Estoque Central + Fábrica.
- `store` — Estoque Central + Lojas.
- `factory_and_store` — em todos.
- **Efeito:** `inventory_stock` é gerado só nas lojas do escopo. Contagens, mínimo/máximo e alertas de ruptura passam a fazer sentido.

### 2) `usage_role` — pra que serve
- `venda_loja` — vai pro cardápio de loja (refri, sobremesa pronta, etc.).
- `venda_fabrica` — vai pro cardápio da fábrica (produto acabado que a fábrica vende p/ a loja em pacote/kg).
- `insumo_producao` — matéria-prima de ficha técnica (nunca vira item de cardápio).
- `insumo_montagem` — usado na loja pra montar prato (ex.: molho pronto que veio da fábrica).
- Um produto pode ter **mais de um papel** (ex.: "MOLHO ALHO E ÓLEO" = `venda_fabrica` + `insumo_montagem` na loja).

### 3) `production_flow` — como é abastecido
- `comprado` — vem de fornecedor externo (nota fiscal → Estoque Central).
- `produzido_fabrica` — a fábrica produz (baixa insumos, gera saldo).
- `misto` — pode ser comprado OU produzido (fallback).

---

## O que muda em cada tela

**Cardápio Fábrica (`/cardapio-fabrica`)**
- Mostra só produtos com `usage_role` contendo `venda_fabrica`.
- Insumos e pré-preparos somem automaticamente (resolve o problema de "polpa de tomate no cardápio").
- Botão "Adicionar ao cardápio" só lista candidatos elegíveis.

**Cardápio Loja (`/cardapio` por marca)**
- Só produtos com `venda_loja` ou receitas cujo produto final tenha esse papel.

**Estoque (`/estoque`)**
- Filtro extra "Escopo" (Central / Fábrica / Loja).
- Loja X só vê produtos do escopo `store` ou `factory_and_store`.
- Estoque Central vê tudo (é o hub).
- Produtos `infinite_stock` continuam invisíveis (regra atual preservada).

**Fichas técnicas (`/fichas-tecnicas`)**
- Ingredientes só podem ser produtos com `insumo_producao` ou `insumo_montagem`.
- Impede erro de colocar refrigerante como ingrediente de prato.

**Fluxo de abastecimento (novo, dashboard rápido)**
- **Recebimento (Estoque Central):** tudo entra aqui via nota (já funciona).
- **Distribuição sugerida:** botão "Sugerir transferência" que, com base em `min_qty`/`target_qty` de cada loja e no `production_flow`, gera:
  - Transferência Central → Loja (comprados).
  - Ordem de produção Fábrica (produzidos) + transferência Fábrica → Loja depois de pronto.
- **Pedido da Loja → Fábrica/Central:** já existe (`factory_requests`); ampliar pra aceitar itens `comprado` (vai pro Central) e `produzido` (vai pra Fábrica) no mesmo pedido, roteando automático.

---

## Plano de execução (faseado, sem quebrar nada)

**Fase 1 — Modelo de dados (migração)**
- Adicionar em `inventory_products`:
  - `stock_scope text` (default `factory_and_store` p/ compatibilidade).
  - `usage_roles text[]` (array; default derivado do `product_type` atual).
  - `production_flow text` (default `comprado`).
- Backfill automático usando as flags atuais (`factory_only`, `is_internal`, `product_type`) — nada se perde.
- Manter `factory_only`/`is_internal` por 1-2 releases como sombra pra rollback, depois descontinuar.

**Fase 2 — Limpeza do `inventory_stock`**
- Trigger: ao criar/alterar produto, sincroniza linhas de `inventory_stock` só nas lojas do `stock_scope`.
- Script único de faxina inicial: remove linhas com `quantity=0` que não pertencem ao escopo (preserva histórico de movimento).

**Fase 3 — Telas**
- Cardápio Fábrica: filtro por `usage_roles @> {venda_fabrica}`.
- Estoque: filtro de escopo + esconder o que não pertence.
- Fichas técnicas: seletor de ingrediente restrito a insumos.
- Ficha do produto (`/produtos-fabrica` e `/estoque/produtos`): 3 selects novos (escopo, papéis, fluxo) num único bloco "Classificação".

**Fase 4 — Distribuição inteligente (opcional, próximo passo)**
- Painel "Sugestão de abastecimento" no Estoque Central: lê saldo × target de cada loja e propõe transferência/produção em 1 clique.

---

## Detalhes técnicos (para referência)

- Nenhuma tabela nova além dos 3 campos em `inventory_products` — máximo reuso.
- `usage_roles` como `text[]` permite produto com múltiplos papéis sem duplicar cadastro (elimina a raiz das duplicidades que você já viu).
- Trigger de sincronização de `inventory_stock` idempotente (safe pra rodar várias vezes).
- Todas as telas afetadas: `FactoryMenu.tsx`, `ProductsFactory.tsx`, `InventoryStock.tsx`, `MenuManager.tsx`, editor de fichas em `src/components/recipes/`, `NewRequestDialog.tsx`.
- Compatível com `infinite_stock`, `product_store_links` e o fluxo iFood/PDV existentes (não mexo em nada de venda/TEF).

---

**Confirma que faz sentido esse modelo (escopo + papéis + fluxo)?** Se sim, começo pela Fase 1 (migração + backfill) e já entrego a Fase 3 (telas usando os novos campos) na sequência.
