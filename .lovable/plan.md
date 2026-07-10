## Objetivo
Fazer com que itens de equipamento que entram por notas/lançamentos sejam **sugeridos automaticamente** para o Patrimônio (`asset_inventory`), sempre com confirmação humana antes de virar bem.

## Como vai funcionar (visão do usuário)

1. Em toda entrada nova — NFe (DFe), recebimento de estoque ou lançamento manual de contas a pagar — o sistema olha o NCM (ou a categoria financeira, no caso manual) e marca os itens candidatos a patrimônio.
2. Um **sino de "Patrimônio pendente"** aparece na página `/patrimonio` com contador (ex.: "3 itens sugeridos").
3. Ao clicar, abre uma fila de sugestões. Para cada item o usuário vê: nota de origem, fornecedor, descrição, NCM, quantidade, valor unitário, loja sugerida — e pode:
   - **Confirmar** (abre modal já preenchido para revisar categoria/nome/nº série/localização e salva no patrimônio),
   - **Ignorar** (marca como "não é patrimônio", nunca mais volta),
   - **Adiar** (fica na fila).
4. Nada entra no patrimônio sem clique. Zero risco de duplicar bem por reprocessamento de nota.

## Regras de sugestão automática

- **NFe / Recebimento**: item vira sugestão se o NCM começar com um dos capítulos de bens de capital — 84 (máquinas), 85 (elétricos/eletrônicos), 90 (instrumentos), 9403 (móveis). Lista editável em Configurações → Patrimônio.
- **Contas a pagar manual**: vira sugestão se a categoria financeira estiver marcada como "Imobilizado". Adicionamos um toggle `is_capex` em `finance_categories`.
- **Valor mínimo**: itens abaixo de R$ 500 são classificados como *utensílio* e entram na fila com categoria pré-selecionada "utensilio"; acima disso, "equipamento". Ajustável.

## Ponto de atenção que precisa da sua decisão durante o uso
Quando uma nota traz "2 fornos" (quantidade 2), o modal pergunta: criar **1 bem com quantidade 2** ou **2 bens individuais** (para números de série diferentes). Padrão sugerido: 1 bem por linha da nota, editável.

## O que muda no banco

- Nova tabela `asset_suggestions` (uma linha por item candidato):
  - origem (`nfe` | `inventory_invoice` | `payable`), id da origem, id do item de origem
  - fornecedor, descrição, NCM, quantidade, valor unitário, loja sugerida, categoria sugerida
  - status (`pending` | `confirmed` | `ignored`), quem confirmou/ignorou, quando
  - `asset_id` (preenchido quando vira bem no `asset_inventory`)
  - UNIQUE(origem, id do item de origem) — impede duplicar se a nota for reprocessada
- Nova coluna `is_capex boolean` em `finance_categories`
- Nova coluna `source_suggestion_id uuid` em `asset_inventory` (rastreabilidade da nota)
- Nova tabela `asset_capex_ncm_prefixes` com os prefixos NCM elegíveis (seedada com 84, 85, 90, 9403)
- Triggers que, após INSERT em `dfe_inbound_items`, `inventory_invoice_items` e `accounts_payable` (quando categoria for capex), criam a linha `pending` em `asset_suggestions`. Idempotentes.
- Backfill inicial: rodar sugestões para notas dos últimos 12 meses, todas em `pending` para você revisar.

## O que muda no frontend

- Página `/patrimonio`: nova aba **"Sugestões da nota"** com badge de pendências, lista com filtro por loja/origem, e ações Confirmar/Ignorar/Adiar em lote.
- Modal de confirmação = o formulário atual de cadastro de bem, já pré-preenchido; ao salvar, cria o `asset_inventory` e marca a sugestão como `confirmed` com `asset_id`.
- Configurações → Patrimônio: gerenciar prefixos NCM elegíveis e valor mínimo de corte.
- Em `finance_categories` (Configurações → Financeiro), toggle **"É imobilizado (gera patrimônio)"**.
- Detalhe de nota (`InvoiceDetailDialog`, `DfeNoteDialog`) ganha selo "→ Patrimônio (pendente/confirmado)" por item, com link direto para a fila.

## O que fica de fora deste plano
- Depreciação automática mensal.
- Baixa de bem quando o item é devolvido/perdido.
- Vínculo com `equipment_warranties` (fica para uma próxima).
