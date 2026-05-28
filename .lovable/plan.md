## Objetivo
Fazer os pedidos novos do iFood voltarem a aparecer no `/pdv-novo`.

## Diagnóstico
- O backend está saudável.
- A tela não está escondendo pedidos: hoje a consulta de `pdv_orders` está voltando vazia.
- A causa mais provável está na ingestão: só a **ASA SUL** tem canal `iFood` cadastrado em `pdv_channels`.
- As demais lojas com `ifood_merchant_uuid` ativo (**ASA NORTE, ÁGUAS CLARAS, LAGO SUL e lojas virtuais de marca**) estão sem canal, então o processamento do iFood tende a pular os eventos com `channel_not_found` antes de gravar em `pdv_orders`.
- Há também um ponto de risco no webhook: ele busca token fixo em **sandbox**, mesmo para lojas em produção.

## Plano
1. **Corrigir o cadastro base dos canais iFood**
   - Criar os registros faltantes em `pdv_channels` para as lojas que já têm integração iFood ativa.
   - Garantir que cada loja que recebe evento tenha um canal `code = 'ifood'` utilizável pelo ingestor.

2. **Ajustar o processamento do webhook/polling**
   - Revisar o fluxo de ingestão para usar o ambiente correto da loja (`production`/`sandbox`) ao buscar detalhes do pedido.
   - Melhorar o tratamento de erro/log quando uma loja estiver mapeada mas sem canal, para o problema ficar visível imediatamente.

3. **Validar ponta a ponta**
   - Disparar uma leitura manual do polling.
   - Confirmar criação de linhas em `pdv_orders`.
   - Conferir se os pedidos aparecem no `/pdv-novo` para a loja selecionada e suas marcas agregadas.

## Detalhes técnicos
- Dados verificados agora:
  - `pdv_orders` nas últimas horas: **0 registros**
  - `pdv_ifood_failed_events`: **0 registros**
  - `pdv_ifood_webhook_log`: **0 registros**
  - `pdv_channels` com iFood:
    - **ASA SUL**: possui canal
    - **ASA NORTE / ÁGUAS CLARAS / LAGO SUL / virtuais**: sem canal
- Arquivos que provavelmente precisarão de ajuste:
  - `supabase/functions/ifood-poll/index.ts`
  - `supabase/functions/ifood-webhook/index.ts`
  - possivelmente uma migration para normalizar `pdv_channels`

## Resultado esperado
- Novos pedidos do iFood passam a ser persistidos em `pdv_orders`.
- O histórico e a lista atual do `/pdv-novo` voltam a mostrar os pedidos normalmente.