## Contexto

O histórico do PDV Gestor está vazio porque **nenhum pedido iFood foi recebido nas últimas 24h em nenhuma loja** (não é bug do filtro/select):

- `pdv_ifood_webhook_log`: 0 registros nas últimas 24h
- `pdv_ifood_failed_events`: vazio
- `pdv_orders` últimos 7 dias: 0 linhas
- Token OAuth iFood: válido, renovado 28/05 19:34

A integração autentica, mas o iFood não está enviando eventos (nem por webhook, nem disponíveis no polling).

⚠️ Código de integração iFood é INTOCÁVEL (já em produção). Esse plano é só investigação + cadastros, **sem alterar edge functions iFood**.

## Passos

### 1. Verificar agendamento do polling (read-only)
- Criar migration somente com `SELECT` em `cron.job` e `cron.job_run_details` filtrando por `%ifood%` para confirmar se existe job ativo chamando `ifood-poll` e se as últimas execuções foram sucesso.
- Se não houver job, **não criar automaticamente** — só reportar para você decidir o intervalo (sugestão: a cada 30s, padrão iFood).

### 2. Conferir status das lojas no Portal do Parceiro iFood
- Confirmar com você (manual no Portal) se as lojas com `ifood_merchant_uuid` (Asa Sul, Asa Norte e virtuais) estão:
  - Abertas / em horário de funcionamento
  - Com webhook URL apontando para `https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/ifood-webhook`
  - Com secret `IFOOD_WEBHOOK_SECRET` igual ao configurado em Lovable Cloud

### 3. Disparar polling manual de teste
- Chamar `ifood-poll` via `supabase--curl_edge_functions` apontando para `production` e mostrar a resposta (`events: N` ou `sem eventos`).
- Olhar `supabase--edge_function_logs` de `ifood-poll` e `ifood-webhook` para ver se houve qualquer chamada nas últimas horas.

### 4. Reportar diagnóstico final
- Se o polling responde "sem eventos" e o webhook não foi chamado → **o problema está no iFood / cadastro do Portal**, não no nosso lado. Você precisaria abrir chamado no iFood ou ajustar config no Portal.
- Se o polling responde com eventos mas eles não viram pedido → log mostrará `merchant_not_mapped` ou `channel_not_found` e aí cadastramos.
- Se webhook foi chamado mas falhou assinatura → ajustar secret.

### 5. (Opcional, só com sua autorização) Cadastrar merchant_uuid para Águas Claras e Lago Sul
- Hoje só Asa Sul e Asa Norte têm merchant cadastrado. Se você tiver os IDs reais das 3 marcas × 2 lojas faltantes, abrir a engrenagem do PDV Gestor → aba iFood → preencher os 6 cards. Não precisa de código.

## Fora do escopo

- Alterar qualquer arquivo em `supabase/functions/ifood-*` ou `supabase/functions/_shared/ifoodAuth.ts`
- Mudar a loja "iFood Homologação"
- Recriar o canal iFood em `pdv_channels` automaticamente (fica para outro plano se virar necessidade real)
