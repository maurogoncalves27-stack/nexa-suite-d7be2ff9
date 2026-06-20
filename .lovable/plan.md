
# Migração Parmê → Nexa

Trabalho grande (5 tabelas, 1 edge function de chat com 5 tools, 7 páginas públicas, CRM com 8 abas, ajustes de domínio). Vou fazer em fases sequenciais para você revisar entre cada uma. Cada fase termina entregável e testável.

Decisões já fechadas: tabelas com nomes canônicos (`reservations`, `support_tickets`, `chat_conversations`, `google_reviews`, `site_settings`), CRM dentro da auth do Nexa (aposenta `ADMIN_PASSWORD`), rotas do site na raiz com guard de hostname.

## Fase 1 — Schema canônico + edge functions locais

- Migration criando: `reservations`, `support_tickets`, `chat_conversations`, `google_reviews`, `site_settings` com mesmo schema do Parmê (campos, tipos, RLS, GRANTs).
- Policies:
  - `reservations`/`support_tickets`/`chat_conversations`: INSERT público (anon) para o chat e formulário, SELECT/UPDATE/DELETE só para `authenticated` com role admin/manager.
  - `google_reviews`: SELECT público (anon).
  - `site_settings`: SELECT público (anon), UPDATE só admin.
- Reescrita das 4 edge functions proxy (`parme-confirm-reservation`, `parme-delete-reservation`, `parme-get-conversation-messages`, `parme-get-ticket-conversation`) para ler/escrever direto nas novas tabelas locais — sem fetch externo, mantendo Z-API para WhatsApp na confirmação.
- Delete de `parme-webhook` e `parme-backfill`.
- Atualização do `src/pages/CRM.tsx` para apontar para `reservations`/`support_tickets`/`chat_conversations` (mantém todo o layout novo já feito).

## Fase 2 — Edge function `parme-chat` + auxiliares

- Port de `src/routes/api.chat.ts` do Parmê (455 linhas, streaming AI SDK + 5 tools: `consultar_cardapio`, `recomendar_prato`, `criar_reserva`, `registrar_problema_pedido`, `sugerir_ifood`) para `supabase/functions/parme-chat/index.ts`. Usa `LOVABLE_API_KEY` via gateway, grava em `chat_conversations`/`reservations`/`support_tickets`.
- `parme-reservation-create` (POST público) e `parme-google-reviews` (GET público). `site_settings` lida direto pelo cliente via supabase-js (RLS public read).

## Fase 3 — Páginas públicas + identidade visual

- Copia fontes Avigea (`public/fonts/Avigea.woff/woff2`) já presentes.
- Cria `src/pages/parme/` com: `Home`, `AquelaParme`, `AqueleEstrogonofe`, `BoxCaipira`, `Sobre`, `Enderecos`, `Reservar`.
- Porta componentes de `src/components/parme/*` e `src/components/admin/conversas-tab` reusáveis (carousel, marquee, reveal, hero etc).
- Layout/Header/Footer/ChatWidget (`/components/parme/SiteLayout.tsx`).
- Adapta Tailwind v4 (`@theme`) do Parmê → tokens v3 no `index.css`/`tailwind.config.ts` deste projeto, isolados em scope `.parme-site` para não vazar no app RH.
- Roteamento em `src/App.tsx`: rotas `/`, `/aquela-parme`, `/aquele-estrogonofe`, `/box-caipira`, `/sobre`, `/enderecos`, `/reservar` envoltas num `<HostnameGuard>` — quando `window.location.hostname === 'aquelaparme.com.br' | 'www.aquelaparme.com.br'` renderiza site Parmê; senão renderiza o app RH normal (atual rota `/` → `Index`).

## Fase 4 — CRM expandido (8 abas do Parmê)

- Mantém `/crm` atual como entrada e converte em layout 8 tabs migrando `src/components/admin/*` do Parmê: Dashboard, CRM, Reservas (já tem), Conversas (já tem), Configurações (site_settings), Personalizar (theme/site_settings), Agente IA (system prompt), Integrações.
- Restringido a usuários autenticados com role admin/manager via `ProtectedRoute`.

## Fase 5 — Cutover

- Prerender SSG das 7 rotas públicas (`vite-plugin-prerender` ou configuração estática) para SEO.
- Conectar domínios `aquelaparme.com.br` + `www` no Nexa e `nexa.aquelaparme.com.br` (esta já está conectada).
- Reapontar webhook Z-API para `https://nexa.aquelaparme.com.br/functions/v1/whatsapp-customer-webhook`.
- Aposentar secrets `PARME_CONSUMER_ID/SECRET` e `ADMIN_PASSWORD` (você remove depois do go-live).

## Pontos técnicos

- Secrets necessárias já presentes: `LOVABLE_API_KEY`, `ZAPI_*`, `ZAPI_CUSTOMER_*`. Nada a adicionar.
- RLS: tabelas públicas (anon INSERT para chat/reservations/support_tickets) precisam de campos rate-limit/captcha futuro — fora do escopo dessa migração.
- Identidade visual do site Parmê fica em CSS escopado `.parme-site { ... }` no `index.css` para não contaminar tokens do app RH (regra imutável do projeto).
- Footer legal do site público continua com "Aquela Parmê" / "Estrogonofe" / "Box Caipira" — não usa branding NEXA.

## Entregável agora

Se você aprovar, começo pela **Fase 1** nesta mensma resposta seguinte (migration + 4 edge functions reescritas + ajuste do `CRM.tsx`). Confirmo cada fase antes de seguir para a próxima.
