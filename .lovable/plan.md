# Vendas pelo WhatsApp com link de pagamento

## Recomendação de gateway: **Mercado Pago**

Por quê (vs Asaas / Stripe / C6):
- **PIX nativo** com QR + link copia-e-cola, taxa ~0,99%, cai no ato.
- **Cartão** com link de checkout pronto (`preferences` API), sem precisar montar tela.
- **Webhook** confiável e simples (`payment.updated`), igual ao padrão que já usamos no iFood.
- Conta MP é grátis, abertura em minutos, e o dinheiro pode ser sacado direto para o C6 (não conflita com a regra de "C6 centralizado" — continua sendo a conta-mãe, MP é só meio de captura).
- Asaas é parecido mas o ecossistema MP/WhatsApp já é mais maduro no Brasil.
- C6 Pay/Stripe ficariam mais lentos (3+ dias de integração, contratos), Stripe não tem PIX nativo brasileiro.

> Se você preferir Asaas, o plano abaixo muda só o adapter — o resto é igual.

## O que **já temos** pronto
- `whatsapp-customer-webhook` recebe mensagens da Z-API (instância CLIENTE já configurada).
- `whatsapp-customer-ai-reply` com Gemini 3 Flash + tools (`search_menu`, `get_store_info`, `register_complaint`).
- Tabelas `pdv_orders`, `pdv_order_items`, `pdv_payments`, `pdv_channels`, `pdv_order_events` — mesmo pipeline do iFood.
- Página admin `/configuracoes/whatsapp-cliente`.

## O que **falta** (6 entregas)

### 1. Conta + credenciais Mercado Pago
Você precisa:
1. Criar/usar conta MP do CNPJ Aquela Parmê.
2. Em **Suas integrações → Criar aplicação** (tipo "Pagamentos online"), gerar credenciais de **produção**.
3. Me passar via secrets:
   - `MERCADOPAGO_ACCESS_TOKEN` (chave secreta — APP_USR-…)
   - `MERCADOPAGO_WEBHOOK_SECRET` (assinatura do webhook, opcional mas recomendado).

### 2. Canal "WhatsApp" no PDV
- Inserir registro em `pdv_channels` (code=`whatsapp`, name=`WhatsApp`, color do design system).
- Adicionar `whatsapp` ao enum/lista de canais aceitos por `pdv_orders.channel`.
- Nova tabela leve `pdv_whatsapp_carts` (sessão de carrinho por telefone, com TTL 24h) para a IA manter contexto entre mensagens — chaves: `phone`, `store_id`, `items jsonb`, `customer_name`, `delivery_address`, `status`, `expires_at`.

### 3. Novas tools da IA (em `whatsapp-customer-ai-reply`)
Adicionar 4 tools, **preservando** as 3 atuais:
- `add_to_cart(item_id, qty, notes?)` → insere/atualiza carrinho da sessão.
- `view_cart()` → retorna itens + total formatado.
- `set_delivery(name, address, payment_method)` → consolida dados do cliente.
- `checkout()` → cria `pdv_order` (status `pending_payment`, canal `whatsapp`, loja Asa Sul no piloto), chama edge `mercadopago-create-link`, devolve URL + QR PIX para a IA enviar ao cliente.

### 4. Nova edge function `mercadopago-create-link`
- Input: `pdv_order_id`.
- Cria `preference` no MP com `external_reference = pdv_order.id`, `notification_url` apontando para nossa webhook, `payment_methods` = PIX + cartão.
- Salva `pdv_payments` (status `pending`, gateway `mercadopago`, link, qr_code_base64).
- Retorna `init_point` (link) + `qr_code` (string copia-e-cola) + `qr_code_base64` (imagem).

### 5. Nova edge function `mercadopago-webhook`
- Recebe notificação `payment.updated`.
- Busca pagamento na API MP (sempre re-consulta, nunca confia no body).
- Se `status=approved`: atualiza `pdv_payments.status=paid`, atualiza `pdv_orders.status=confirmed`, dispara evento em `pdv_order_events`, e o pedido entra no **mesmo fluxo do iFood** (KDS, impressora, baixa de estoque).
- Envia mensagem de confirmação no WhatsApp do cliente via `send-whatsapp` (usando instância CLIENTE).

### 6. Painel + piloto Asa Sul
- Em `/configuracoes/whatsapp-cliente`, nova aba **"Vendas"**:
  - Toggle "Aceitar pedidos via WhatsApp" por loja (no piloto, só Asa Sul fica ON).
  - Lista dos últimos pedidos WhatsApp com status (pending_payment / paid / cancelled).
  - Link para abrir o pedido no `/pedidos`.
- Cardápio usado é o mesmo do iFood/Totem (tabela `menu_items` já existe).
- Endereço: pedimos manualmente na conversa (sem geolocalização nessa Fase 1).

## Fluxo final (visão do cliente)
```text
Cliente   →  "quero 1 parmegiana grande"
IA        →  busca menu, mostra opções e preço, pede confirmação
Cliente   →  "sim, entrega rua tal nº 10"
IA        →  cria pedido + link MP, envia:
             "Total R$ 79,90. Pague no PIX:
              [QR-code.png]  ou link: https://mpago.la/abc"
Cliente   →  paga
MP webhook → confirma pedido → vai para KDS Asa Sul
IA        →  "Pagamento confirmado! Pedido #1234 saiu pra preparo 🍽️"
```

## Detalhes técnicos
- **Stack:** edge functions Deno + Mercado Pago SDK via `npm:mercadopago@2`.
- **Idempotência:** `external_reference` = `pdv_order.id` (UUID), webhook é seguro reprocessar.
- **Segurança webhook:** valida header `x-signature` com `MERCADOPAGO_WEBHOOK_SECRET`; retorna 503 se secret faltar (mesmo padrão que aplicamos no iFood/Z-API).
- **RLS:** `pdv_whatsapp_carts` — apenas service_role grava; UI lê via função SECURITY DEFINER se necessário.
- **Não toca em:** TEF/ACBr, iFood (em produção), C6 Pay, fluxo do Totem.
- **Memória a atualizar após approvar:** ajustar a Core sobre C6 para "recebimento físico via TEF/PIX no pinpad; recebimento online via Mercado Pago para canal WhatsApp" — sem ferir o resto.

## Fora deste plano (entram em fases seguintes)
- Roteamento automático entre as 4 lojas pelo endereço.
- Cupom de desconto / programa de fidelidade.
- Envio de catálogo nativo do WhatsApp (cards interativos) — exige Meta Cloud API, não tem na Z-API.
- Pagamento recorrente / assinatura.

Pronto para implementar quando você aprovar — a primeira coisa que vou pedir são as credenciais do Mercado Pago.
