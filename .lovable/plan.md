
# Cardápio compartilhado entre marcas

## Objetivo
1. Um mesmo item (ex: Coca 350ml) aparece em várias marcas com **preço único** e **pause único** (desativou, pausa em todas).
2. Categorias podem ser **globais**, ligadas a várias marcas, com mudança refletindo em todas.
3. Grupos de complementos (ex: "Acompanhamentos", "Adicionais") viram **catálogo reutilizável** — crio uma vez, linko em N pratos; pausar grupo ou opção pausa em todos os itens que usam.

## Modelo de dados

### Itens (já parcialmente pronto)
- `menu_items` continua com 1 linha por produto, preço/`is_active` únicos.
- `menu_item_brands` (M2M já existente) → controla em quais marcas aparece.
- Nada muda aqui além do uso correto no editor (já funciona).

### Categorias compartilhadas
- Migrar para modelo M2M:
  - Nova tabela `menu_category_brands(category_id, brand_id)` (PK composta).
  - Manter `menu_categories.brand_id` apenas como legado durante a migração; depois ignorar/remover via segundo passo.
  - Backfill: para cada `menu_categories` atual, inserir uma linha em `menu_category_brands` com a marca atual.
- UI da categoria passa a ter multi-select de marcas (mesmo padrão dos chips do item).

### Catálogo global de complementos (NOVO)
Substitui `menu_item_complement_groups` / `menu_item_complement_options` por modelo reutilizável:

```text
complement_groups            (id, name, is_required, min_choices, max_choices, is_active, sort_order)
complement_options           (id, group_id, name, extra_price, linked_item_id, is_active, sort_order)
menu_item_complement_links   (menu_item_id, group_id, sort_order)   -- PK composta
```

- `complement_groups.is_active=false` → grupo some de TODOS os pratos no PDV/Totem/Cardápio (pause global).
- `complement_options.is_active=false` → opção some em todos (ex: "Coca em falta" some de todos os pratos).
- Mesmas policies já aplicadas em micg/mico (read auth, write staff/super_user).

### Migração de dados existentes
- Para cada `menu_item_complement_groups` atual:
  - Criar um `complement_groups` correspondente (nome único por hash de nome+min+max para deduplicar igual; quando ambíguo, manter 1 por item original).
  - Migrar opções para `complement_options`.
  - Criar `menu_item_complement_links` ligando ao item original.
- Manter tabelas antigas por 1 release (read-only) só pra rollback; código novo lê só das novas.

## UI

### Página `/cardapio` (lista)
- Tabs por marca continuam (filtro de visualização).
- Item compartilhado em N marcas mostra badge "+N marcas" (já existe).
- Botão "Desativar" continua único (pausa em todas).

### Editor de item (`MenuItemEditorDialog`)
- Chips de marca: mantém.
- Categoria: select carrega categorias visíveis em QUALQUER marca selecionada do item (não só na marca ativa).
- Bloco "Grupos de complementos" reformulado:
  - Vira **lista de grupos linkados** (do catálogo).
  - Botão **"Vincular grupo existente"** → modal de busca no catálogo `complement_groups`.
  - Botão **"Criar novo grupo"** → abre editor inline que grava no catálogo e já linka.
  - Cada linha do grupo linkado mostra nome, badge "usado em X pratos", botão desvincular (não apaga do catálogo) e link "editar grupo" (avisa que afeta todos os pratos).

### Nova página `/cardapio/complementos`
- CRUD do catálogo global: lista de grupos + opções, toggle ativo/inativo, contador "usado em N pratos".
- Acessível pelo submenu "Cardápio → Complementos".

### Nova página `/cardapio/categorias` (opcional, pode ficar inline no Cardápio)
- CRUD de categoria global com multi-select de marcas.
- Por ora, ampliar o `AddCategoryDialog` para suportar multi-marca (com a marca ativa pré-selecionada).

## Faseamento
1. **Fase 1 — Migração de schema**: criar tabelas novas, backfill, grants/RLS. Sem mexer em UI ainda — só garante que código antigo segue funcionando.
2. **Fase 2 — Editor de item**: trocar bloco de complementos para usar catálogo (vincular/desvincular). Categoria multi-marca.
3. **Fase 3 — Página `/cardapio/complementos`**: CRUD do catálogo + contador de uso.
4. **Fase 4 — Consumidores**: ajustar PDV-Novo / Totem / Garçom para ler complementos via `menu_item_complement_links` → `complement_groups` (respeitando `is_active`).
5. **Fase 5 — Limpeza**: depois de 1 release estável, dropar `menu_item_complement_groups` e `menu_item_complement_options`.

## Pontos de atenção
- Editor antigo escreve em `menu_item_complement_groups`; durante a transição (fase 2-3) o código novo precisa ler do catálogo, e o backfill da fase 1 garante que itens existentes não percam complementos.
- PDV-Novo, Totem e Garçom usam complementos; precisam ler do novo modelo na fase 4 — listar os componentes afetados antes de mexer.
- `pos_item_mappings` e `recipes` não são tocados.
- Manter tudo mobile-first e usando tokens do design system.

## O que NÃO entra agora
- Preço por marca (você escolheu preço único).
- Mudança em `/pdv` legado (Saipos).
- Histórico de versões de cardápio.
