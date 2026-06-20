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
- ⏸️ **Fase 4** — CRM 8 abas. `CRM.tsx` atual tem Dashboard/Reservas/Tickets/Conversas. As outras 4 (Configurações, Personalizar, Agente IA, Integrações) ficam **parqueadas** — exigem ~1500 linhas de UI portada e dependem de leitura/escrita em `parme_site_settings`. Quando quiser, atacamos uma por vez.
- ⏸️ **Fase 5** — Cutover de domínio:
  1. Conectar `aquelaparme.com.br` e `www.aquelaparme.com.br` neste projeto (Project Settings → Domains).
  2. Manter `nexa.aquelaparme.com.br` e `nexasuite.aquelaparme.com.br` apontados como hoje (mesmo projeto, hostname não bate no guard).
  3. Z-API webhook (cliente) reaponta pra `https://nexa.aquelaparme.com.br/functions/v1/whatsapp-customer-webhook` (já é o destino atual).
  4. Despublicar o projeto Parmê antigo e deletar.
  5. (Opcional) prerender SSG das 7 rotas pra SEO — Vite SSG não está configurado; pode ser feito depois.
