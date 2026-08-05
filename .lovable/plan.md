# Cardápio único no SmartPOS/Garçom + PWA para GPOS780

O cardápio da empresa deve ser único para totem, SmartPOS, Garçom e site. Hoje o Garçom já usa `loadMenuCatalog`, mas sem complementos; o SmartPOS ainda carrega `menu_items` diretamente, ignorando a disponibilidade por loja. Ambos não persistem complementos.

## Escopo

### 1. Unificar leitura do cardápio
- Migrar `SmartPos.tsx` para usar `loadMenuCatalog(storeId)` (igual ao Garçom e ao totem).
- Garantir que ambos respeitem `menu_item_stores.is_available` e, quando aplicável, `menu_item_brands`.
- Remover queries diretas em `menu_categories`/`menu_items` dessas páginas.

### 2. Complementos no SmartPOS e Garçom
- Reutilizar o fluxo de complementos já existente no totem (`loadItemComplements`, `SelectedComplement`).
- Adicionar diálogo de escolha de complementos ao tocar no item no SmartPOS e no Garçom.
- Calcular preço final do item = preço base + soma dos `extra_price` dos complementos selecionados.
- Persistir complementos no campo `pdv_order_items.complements` (JSONB) no formato já usado pelo totem.
- Exibir complementos no resumo da conta, no recibo e na cozinha.

### 3. PWA / instalação na GPOS780
- Criar `public/manifest-waiter.json` com nome "NEXA Garçom", ícone NEXA, `display: standalone`, theme-color do portal.
- Adicionar prefixos `/smartpos` e `/garcom` no `RoleManifest.tsx` apontando para o novo manifesto.
- Criar `docs/INSTALACAO-SMARTPOS.md` com passos: abrir navegador da GPOS780 na URL publicada, fazer login, "Adicionar à tela inicial", configurar TEF em `/configuracoes/smartpos`.
- Garantir que `/smartpos/login` e `/garcom` também carreguem o manifesto de garçom (prefix matching).

### 4. Ajustes de persistência
- `createDraftOrder` em `src/lib/smartpos/sale.ts` já aceita itens; estender o payload para incluir `complements` e gravar em `pdv_order_items.complements`.
- No Garçom, ao enviar rodada, gravar `round_id` e `complements` em cada item.
- No SmartPOS, ao finalizar venda, manter o mesmo fluxo de `pdv_orders` + `pdv_payments` já implementado.

### 5. Validação
- Testar em preview: SmartPOS e Garçom devem listar apenas itens disponíveis na loja selecionada.
- Testar complementos: item com complementos deve abrir diálogo, somar valores e aparecer no recibo.
- Verificar manifesto trocado ao navegar para `/smartpos/login` (DevTools → Application → Manifest).

## Detalhes técnicos

- Arquivos: `src/pages/SmartPos.tsx`, `src/pages/Garcom.tsx`, `src/lib/smartpos/sale.ts`, `src/components/pwa/RoleManifest.tsx`.
- Novos arquivos: `public/manifest-waiter.json`, `docs/INSTALACAO-SMARTPOS.md`.
- Tabela: `pdv_order_items.complements` (jsonb) já existe; nenhuma migração de schema é necessária.
- Ícone: reutilizar `public/icones/nexa_icone.png` e gerar ícones 192/512 para o manifesto.
- Não alterar `electron-totem/**`, `electron-acbr/**`, `src/lib/tef/**` sem confirmação expressa (memória de TEF congelado).
