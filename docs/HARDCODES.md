# NEXA — Mapa de hardcodes

> Inventário para resolver **um a um**. Piloto: Asa Sul · Atualizado: jun/2026  
> Legenda prioridade: **P0** bloqueia piloto · **P1** multi-loja · **P2** operação · **P3** cosmético/doc

**Como usar:** escolha um `#ID`, marque `[x]` quando resolver, anote a config alvo (tabela/env).

---

## Resumo por área

| Área | Qtd | Prioridade típica | Config alvo sugerida |
|------|:---:|-------------------|----------------------|
| [H1](#h1--agente-tef-urls-e-portas) Agente TEF | 12 | P0–P1 | `pdv_tef_config.agent_url` + env agente |
| [H2](#h2--paygo--pinpad) PayGo / pinpad | 14 | P0 | env agente + `pdv_tef_config` |
| [H3](#h3--payer) Payer | 5 | P0 | env `PAYER_*` + `pdv_tef_config` |
| [H4](#h4--totem-e-lojas) Totem / lojas | 18 | P0–P1 | `user_metadata.totem_store` + DB |
| [H5](#h5--canais-pdv) Canais PDV | 3 | P1 | `pdv_channels` por loja |
| [H6](#h6--supabase--infra) Supabase | 3 | P1 | `.env` / Lovable secrets |
| [H7](#h7--domínios-e-urls-públicas) Domínios | 10 | P2 | `PUBLIC_SITE_URL` / settings loja |
| [H8](#h8--listas-de-lojas-repetidas) Listas de lojas | 8 | P1 | query `stores` + RBAC |
| [H9](#h9--marcas-logos-totem) Marcas / logos | 6 | P2 | `totem_assets` + storage |
| [H10](#h10--fiscal-nfc-e) Fiscal | 4 | P1 | secrets Focus + store config |
| [H11](#h11--seeds-e-logins) Seeds / logins | 2 | P2 | edge admin-only |

---

## H1 — Agente TEF (URLs e portas)

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H1.01 | `src/lib/tef/index.ts` | `agentUrl: "https://127.0.0.1:3031"` (DEFAULT_CONFIG) | P1 | Sempre `loadTefConfig(storeId)`; fallback só dev |
| H1.02 | `src/lib/tef/payerAdapter.ts` | `AGENT_URL = "https://127.0.0.1:3031"` | P0 | Parâmetro obrigatório de `loadTefConfig` |
| H1.03 | `src/components/tef-payer/PayerTestSaleCard.tsx` | idem H1.02 | P0 | Prop `agentUrl` do setup |
| H1.04 | `src/pages/TefPayerSetup.tsx` | idem H1.02 | P0 | Ler `pdv_tef_config` da loja |
| H1.05 | `src/pages/TefPaygoSetup.tsx` | fallback `https://127.0.0.1:3031` | P0 | idem |
| H1.06 | `src/components/tef-paygo/TefHomologationChecklist.tsx` | idem | P0 | idem |
| H1.07 | `src/components/pdv-novo/TefConfigPanel.tsx` | `DEFAULT_AGENT_URL` todos providers → 3031 | P1 | Template por provider na UI |
| H1.08 | `src/pages/NfceTester.tsx` | `DEFAULT_URL = "https://127.0.0.1:3031"` | P3 | Campo salvo em localStorage |
| H1.09 | `electron-acbr/server.cjs` | portas `3030` / `3031` | P2 | `ACBR_AGENT_PORT`, `ACBR_AGENT_HTTPS_PORT` (já env) |
| H1.10 | `electron-acbr/main.cjs` | links health 3030/3031 | P3 | OK (doc local) |
| H1.11 | `src/pages/TefPaygoSetup.tsx` | `AGENT_EXE_URL` versão `1.5.13` fixa | P1 | `releases/latest.json` ou env |
| H1.12 | `src/lib/tef/sitefAdapter.ts` | comentário/doc `3030` | P3 | Doc only |

**Meta:** uma função `getAgentUrl(storeId)` usada em totem, testes TEF e Payer.

---

## H2 — PayGo / pinpad

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H2.01 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_CNPJ` default `44932369000108` | P0 | env obrigatório prod; UI setup |
| H2.02 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_PDC` default `111476` | P0 | env / `pdv_tef_config.terminal_code` |
| H2.03 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_AMBIENTE` default `DEMO` | P0 | `pdv_tef_config.environment` |
| H2.04 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_SENHA_TECNICA` default `314159` | P0 | secret env, nunca default prod |
| H2.05 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_PINPAD_PORT` default `"5"` (COM5) | P0 | config por totem (store/device) |
| H2.06 | `electron-acbr/acbr-tefd.cjs` | `PAYGO_QR_DISPLAY_PREF` default `"2"` | P1 | `pdv_tef_config` ou totem settings |
| H2.07 | `electron-acbr/acbr-tefd.cjs` | caminhos fixos `C:\Program Files...\PGWebLib.dll` | P2 | `PAYGO_DLL_PATH` |
| H2.08 | `src/pages/TefPaygoSetup.tsx` | `DEFAULT_PDC`, `DEFAULT_HOST`, `DEFAULT_CNPJ` | P0 | Colunas em `pdv_tef_config` ou store settings |
| H2.09 | `src/pages/TefPaygoSetup.tsx` | host sandbox `pos-transac-sb.tpgweb.io:31735` | P0 | config demo vs prod |
| H2.10 | `src/components/tef-paygo/TefTestSaleCard.tsx` | acquirer default `DEMO` | P1 | UI + config loja |
| H2.11 | `src/components/tef-paygo/TefTestSaleCard.tsx` | `DEFAULT_SALE_ID = "VENDA-1001"` | P3 | UUID / order id real |
| H2.12 | `src/components/tef-paygo/TefTestSaleCard.tsx` | badge/texto **"ASA SUL"** | P1 | `storeId` → nome da loja |
| H2.13 | `src/components/tef-paygo/TefTestSaleCard.tsx` | queries filtradas “Asa Sul” nos logs | P1 | `storeId` prop |
| H2.14 | `electron-acbr/acbr-tefd.cjs` | `AUTCAP=388` (bit flags PayGo) | P2 | Manter código; documentar (não é loja) |

---

## H3 — Payer

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H3.01 | `electron-acbr/payer-localhost.cjs` | `PAYER_BASE_URL` default `http://127.0.0.1:6060` | P0 | env (OK local; documentar) |
| H3.02 | `electron-acbr/payer-localhost.cjs` | `PAYER_EMAIL` / `PAYER_PASSWORD` vazios | P0 | env no PC totem (já previsto) |
| H3.03 | `src/pages/TefPayerSetup.tsx` | URL docs Payer fixa | P3 | constante doc |
| H3.04 | `src/lib/tef/payerAdapter.ts` | funções com default agent URL | P0 | ver H1.02 |
| H3.05 | `pdv_tef_config` + `TefConfigPanel` | provider `payer` | P0 | ✅ UI + migration |

---

## H4 — Totem e lojas

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H4.01 | `src/pages/Totem.tsx` | `DEFAULT_TOTEM_STORE = "asa sul"` | P0 | Só `user_metadata.totem_store` |
| H4.02 | `src/pages/Totem.tsx` | `TOTEM_LOGIN_STORE_MAP` (4 emails → loja) | P0 | **Remover**; usar metadata do auth |
| H4.03 | `supabase/functions/seed-totem-logins/index.ts` | mesmos 4 emails/lojas | P1 | Seed one-time; metadata canônico |
| H4.04 | `src/pages/Totem.tsx` | logos importadas `@/assets/logo-*` | P2 | `totem_assets` (já existe TotemConfig) |
| H4.05 | `src/pages/Totem.tsx` | fotos fake parme/box/estrogonofe | P2 | `totem_assets` bucket |
| H4.06 | `src/pages/Totem.tsx` | `resolveBrandLogo()` slug `parme` | P2 | assets DB |
| H4.07 | `src/pages/Totem.tsx` | `TOTEM_THEME_STYLE` cores Parme | P2 | theme por brand/store |
| H4.08 | `src/pages/Totem.tsx` | `IDLE_TIMEOUT_MS = 60_000` | P2 | settings totem |
| H4.09 | `src/pages/Totem.tsx` | `PHOTO_BUCKET = "menu-photos"` | P3 | constante infra |
| H4.10 | `src/pages/Totem.tsx` | canal criado como `"balcao"` | P1 | ver H5 |
| H4.11 | `src/lib/order/closeOrder.ts` | canal `"balcao"` duplicado | P1 | ver H5 |
| H4.12 | `src/pages/Auth.tsx` | redirect totem via `totem_login` | P2 | OK (flag metadata) |
| H4.13 | `src/pages/Totem.tsx` | pickup code random 3 dígitos | P2 | sequência por loja/dia |
| H4.14 | `src/pages/Totem.tsx` | notes `Totem · Comer aqui/Para levar` | P3 | i18n / template |
| H4.15 | `src/pages/Totem.tsx` | payment method sempre `"credit"` | P1 | mapear `tef.method` / cardBrand |
| H4.16 | `TOTEM_LOGIN_STORE_MAP` vs seed | **duplicação** email→loja | P0 | fonte única: auth metadata |
| H4.17 | `src/pages/TotemConfig.tsx` | bucket `totem-backgrounds` | P3 | OK infra |
| H4.18 | Piloto docs | “Asa Sul” como default em toda homologação | P2 | doc only |

---

## H5 — Canais PDV

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H5.01 | `Totem.tsx` / `closeOrder.ts` | `code: "balcao"` auto-insert | P1 | Canal `totem` por loja (migration seed) |
| H5.02 | `Totem.tsx` | nome canal `"Balcão"` | P1 | Cadastro `pdv_channels` |
| H5.03 | Vários | sem canal `whatsapp` / `garcom` explícito | P2 | enum canais + factory closeOrder |

**Meta:** totem usa `pdv_channels.code = 'totem'`, garçom `'mesa'`, WhatsApp `'whatsapp'`.

---

## H6 — Supabase / infra

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H6.01 | `src/integrations/supabase/client.ts` | URL + anon key fallback | P1 | `.env` Lovable; remover fallback em prod? |
| H6.02 | `supabase/config.toml` | `project_id` ixjgmerxxakdkfdzgumy | P2 | sync Lovable (não duplicar) |
| H6.03 | `src/integrations/supabase/types.ts` | gerado | — | Regenerar após migrations |

---

## H7 — Domínios e URLs públicas

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H7.01 | `electron/main.cjs` | `https://nexasuite.aquelaparme.com.br/loja` | P1 | env build Electron |
| H7.02 | `src/pages/Recruitment.tsx` | `PUBLIC_BASE` nexasuite | P2 | `VITE_PUBLIC_SITE_URL` |
| H7.03 | `src/pages/FreelancerJobs.tsx` | idem | P2 | idem |
| H7.04 | `src/lib/documentVerification.ts` | idem | P2 | idem |
| H7.05 | `supabase/functions/notify-user/index.ts` | `PUBLIC_SITE_URL` fallback nexa.aquelaparme | P2 | secret Supabase |
| H7.06 | `supabase/functions/send-push-on-notification/index.ts` | idem | P2 | idem |
| H7.07 | `supabase/functions/send-transactional-email/index.ts` | domínios email `@aquelaparme` | P2 | secrets Resend |
| H7.08 | `src/pages/Auth.tsx` | texto domínio nexasuite | P3 | copy |
| H7.09 | `src/pages/PublicJobDetail.tsx` | favicon aquelaparme.com.br | P3 | brand settings |
| H7.10 | `TefPaygoSetup.tsx` | URL release agent `.exe` | P1 | ver H1.11 |

---

## H8 — Listas de lojas (repetidas)

Mesma lista em **8+ arquivos** — candidato a `useStoreScope()` / query `stores`.

| ID | Arquivo | Hardcode | Prioridade |
|:--:|---------|----------|:----------:|
| H8.01 | `src/pages/Menu.tsx` | `STORE_NAMES` 4 lojas | P1 |
| H8.02 | `src/pages/Garcom.tsx` | `ALLOWED` 4 lojas | P1 |
| H8.03 | `src/pages/SmartPos.tsx` | `ALLOWED_STORE_NAMES` | P1 |
| H8.04 | `src/components/nutricontrol/NutriStoreSelector.tsx` | `ALLOWED` + fábrica | P1 |
| H8.05 | `src/components/finance/DreAllocatedPanel.tsx` | `ALLOCATION_STORE_NAMES` | P1 |
| H8.06 | `src/lib/scheduleRules.ts` | cores por nome `"asa sul"` | P2 |
| H8.07 | `supabase/functions/send-push-on-notification/index.ts` | map `"ASA SUL"` → ícone | P2 |
| H8.08 | `supabase/functions/notify-user/index.ts` | idem | P2 |

**Meta:** `stores` table + `user_store_access` / RBAC; zero array literal de nomes.

---

## H9 — Marcas / logos totem

| ID | Arquivo | Hardcode | Prioridade |
|:--:|---------|----------|:----------:|
| H9.01 | `Totem.tsx` | imports PNG logos 3 marcas | P2 |
| H9.02 | `Totem.tsx` | imports JPG fake backgrounds | P2 |
| H9.03 | `Totem.tsx` | `if (n.includes("parme"))` heurística | P2 |
| H9.04 | `Recipes.tsx` | `HIDDEN_BRAND_SLUGS` totem/salao | P2 |
| H9.05 | `DailyAnalytics.tsx` | regex canal `/totem/` | P3 |
| H9.06 | Assets path | `@/assets/logo-aquela-parme.png` etc. | P2 |

---

## H10 — Fiscal / NFC-e

| ID | Arquivo | Hardcode | Prioridade | Resolver com |
|:--:|---------|----------|:----------:|--------------|
| H10.01 | `supabase/functions/nfce-emit/` | token Focus em secret | P0 | Secret Supabase (já env) |
| H10.02 | `src/lib/order/emitNfce.ts` | poll 6× 1.5s | P2 | config retry |
| H10.03 | `NfceTester.tsx` | agente local vs Focus cloud | P2 | doc dual path |
| H10.04 | Loja | CNPJ/IE/csc NFC-e Asa Sul | P0 | tabela fiscal store (Focus) |

---

## H11 — Seeds e logins

| ID | Arquivo | Hardcode | Prioridade |
|:--:|---------|----------|:----------:|
| H11.01 | `seed-totem-logins/index.ts` | 4 usuários totem | P2 |
| H11.02 | `seed-store-logins/index.ts` | 4 PCs loja | P2 |

---

## Ordem sugerida (piloto Asa Sul)

Resolver nesta ordem para destravar homologação sem refator grande:

```
1. H4.01–H4.02  totem_store só via metadata (remove map email)
2. H1.02–H1.07  agent URL da pdv_tef_config em todas telas TEF
3. H2.01–H2.05  PayGo env no PC totem (documentar .env agente)
4. H5.01        canal totem vs balcão
5. H4.15        método pagamento correto no pdv_payments
6. H2.08–H2.09  PayGo setup defaults → DB
7. H8.*         listas de lojas (batch separado / Lovable)
8. H7.*         URLs públicas → VITE_PUBLIC_SITE_URL
9. H9.*         assets totem → TotemConfig
```

---

## Checklist de progresso

### P0 — Piloto totem/TEF

- [ ] H1.02–H1.05 — agent URL dinâmico (Payer/PayGo test)
- [ ] H2.01–H2.05 — env PayGo no agente documentado
- [ ] H4.01–H4.02 — totem store sem map email
- [ ] H4.15 — método pagamento TEF
- [ ] H5.01 — canal `totem`
- [ ] H10.04 — dados fiscal Asa Sul no Focus

### P1 — Multi-loja / config

- [ ] H1.01, H1.07 — defaults TEF
- [ ] H2.08–H2.12 — PayGo UI → DB
- [ ] H8.01–H8.05 — listas de lojas
- [ ] H6.01 — fallback supabase (decisão prod)

### P2 — UX / operação

- [ ] H4.04–H4.07 — assets totem
- [ ] H7.* — domínios
- [ ] H9.* — logos

---

## Referências

| Tema | Onde configurar hoje |
|------|----------------------|
| TEF por loja | `pdv_tef_config` |
| Agente local | env + `electron-acbr/.env` |
| Totem visual | `/configuracoes/totem` → `totem_assets` |
| Homologação | `docs/HOMOLOGACOES.md` |
| Fechamento venda | `src/lib/order/` |
