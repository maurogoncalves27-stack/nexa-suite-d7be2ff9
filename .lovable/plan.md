# Migração Parmê → Nexa

## Status

- ✅ **Fase 1** — Schema canônico (`reservations`, `support_tickets`, `chat_conversations`, `google_reviews`, `parme_site_settings`) + 4 edge functions locais (`parme-confirm-reservation`, `parme-delete-reservation`, `parme-get-conversation-messages`, `parme-get-ticket-conversation`). `parme-webhook` e `parme-backfill` removidos. `CRM.tsx` apontando para tabelas locais.
- ✅ **Fase 2** — `parme-chat` (streaming + 5 tools: cardápio, recomendação, reserva, problema de pedido, sugerir iFood), `parme-reservation-create` (POST público) e `parme-google-reviews` (GET público) deployadas e validadas.
- ✅ **Fase 3** — Site público funcional em `/parme/*`:
  - `src/styles/parme-site.css` escopado em `.parme-site` (não vaza tokens no RH).
  - `src/components/parme-site/`: `SiteLayout`, `SiteHeader`, `SiteFooter`, `ChatWidget` (fetch SSE nativo), `brand-theme.ts`, `HostnameGuard`.
  - 7 páginas em `src/pages/parme/`: `Home`, `Brand` (dinâmica p/ aquela-parme / box-caipira / aquele-estrogonofe), `Sobre`, `Reservar`, `Enderecos`.
  - `HostnameGuard` redireciona `aquelaparme.com.br` / `www.aquelaparme.com.br` para `/parme/*` automaticamente.
  - **Pendente (opcional, visual):** fontes Avigea em `/public/fonts/Avigea.woff2` (hoje cai pra Alfa Slab One). Imagens dos pratos não foram copiadas; visual usa emojis grandes + tipografia. Pra fidelidade total, pode-se copiar `/src/assets/parme/*` do projeto Parmê (~50 imagens) e voltar pros componentes `collage-hero/dish-grid/dripping-wave/etc` do original.
- ✅ **Fase 4** — CRM completo com 7 abas (Dashboard, Reservas, Tickets, Conversas, Personalizar, Agente IA, Integrações) via `ParmeSettingsPanels.tsx` persistindo em `parme_site_settings`.
- 🟡 **Fase 5 — Cutover de domínio (parcial / operacional):**
  - ✅ SEO básico pronto: `public/robots.txt` libera site público e bloqueia rotas privadas do RH (`/crm`, `/dashboard`, `/employees`, etc.); `scripts/generate-sitemap.ts` gera `public/sitemap.xml` com as 7 rotas públicas no `predev`/`prebuild`.
  - ⏳ **Você precisa fazer manualmente:**
    1. Project Settings → Domains: conectar `aquelaparme.com.br` (primary) e `www.aquelaparme.com.br` neste projeto. Manter `nexa.aquelaparme.com.br` / `nexasuite.aquelaparme.com.br` como estão.
    2. Despublicar e deletar o projeto Parmê antigo no seu painel.
    3. Z-API webhook do cliente já aponta pra `nexa.aquelaparme.com.br/functions/v1/whatsapp-customer-webhook` — nada a mudar.
  - ⏸️ **Opcional, não bloqueante:** prerender SSG das 7 rotas públicas. Hoje é SPA puro (Google indexa via JS). Se quiser HTML estático no first paint, configurar `vite-plugin-ssg` ou script de prerender — fica pra depois do cutover pra não arriscar a build atual.
