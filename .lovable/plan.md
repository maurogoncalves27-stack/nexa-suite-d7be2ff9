## Objetivo
No PDV (`/pdv-novo`), mostrar 3 bolinhas flutuantes do widget iFood (Parmê / Estrogonofe / Box Caipira) com merchantId daquela loja física. Trocar de loja troca os UUIDs. CRM volta a ter widget único de visualização.

## O que VOCÊ faz no Portal Desenvolvedor iFood
1. Criar **3 widgets** (um por marca), anotando os 3 `widgetId`:
   - **Aquela Parmê** → cor `#EB0033` (vermelho), Posição `Direita`, Margin Y `16`
   - **Estrogonofe** → cor marrom (`#5D3A1A`), Posição `Direita`, Margin Y `80`
   - **Box Caipira** → cor laranja (`#F58220`), Posição `Direita`, Margin Y `144`
   (Margins Y diferentes = empilham uma "um pouco atrás da outra")
2. Para cada widget, anotar o **merchantId UUID** de cada loja física onde aquela marca opera (Portal Parceiro → Configurações da Loja → ID da loja).

## O que EU faço no NEXA

### 1. Tabela de configuração (`pdv_ifood_widgets`)
Estrutura mínima:
- `store_id` (uuid, FK stores)
- `brand` (`aquela_parme` | `estrogonofe` | `box_caipira`)
- `widget_id` (uuid do iFood) — mesmo para todas as lojas da mesma marca
- `merchant_id` (uuid do merchant daquela loja+marca)
- PK composta `(store_id, brand)`
- RLS: SELECT autenticado (qualquer user logado lê); INSERT/UPDATE/DELETE só admin/super_user.

### 2. Tela de configuração `/configuracoes/ifood-widgets`
- Tabela com 4 linhas (lojas físicas) × 3 colunas (marcas).
- Em cada célula: input do merchant UUID (vazio = marca não opera naquela loja → não mostra bolinha).
- No topo: 3 inputs para os 3 `widgetId` (um por marca, global).
- Botão Salvar grava em `pdv_ifood_widgets`.

### 3. Componente `IFoodFloatingWidgets`
- Recebe `storeId`.
- Faz query da tabela filtrando por `store_id`.
- Para cada linha encontrada com `merchant_id` preenchido: chama `iFoodWidget.init({ widgetId, merchantIds: [merchant_id] })`.
- Carrega o `widget.js` uma única vez.
- Ao trocar de `storeId`: faz unmount/cleanup (remover containers injetados pelo iFood, se possível) e re-inicializa com os novos UUIDs.

### 4. Integração no PDV
- Em `src/pages/PdvNovo.tsx`: renderizar `<IFoodFloatingWidgets storeId={storeId} />` quando `storeId` for uma loja física (não "ALL", não virtual).
- Não renderizar no resto do app (são bolinhas flutuantes globais; ficam ativas só enquanto o usuário está no PDV).

### 5. CRM (limpeza)
- Em `/crm` → aba Avaliações: substituir o componente atual `IFoodReviewsWidget` por uma versão **somente leitura/visualização** que usa as mesmas configs da tabela (mesmo card por loja, mostrando os 3 widgets se houver). Ou simplesmente remover o widget do CRM, já que agora as bolinhas vivem no PDV. **Pergunto antes de implementar.**

## Riscos / observações
- O script oficial do iFood pode não suportar 3 inits simultâneos no mesmo documento. Plano de contingência: se conflitar, montar apenas 1 bolinha por vez com seletor visual de marca dentro da bolinha (mantém o conceito mas reduz para 1 widget). Confirmo isso na hora de testar.
- As bolinhas só aparecem após autorização inicial no Portal Parceiro (você já faz, sem problema).

## Pergunta de confirmação
- O widget no **CRM/Avaliações**: removo (some), mantenho como visualizador admin de todas as lojas, ou mantenho exatamente como está hoje?
