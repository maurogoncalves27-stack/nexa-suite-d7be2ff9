# NEXA — Homologações e integrações

> Piloto: **Asa Sul** · Atualizado: jun/2026  
> Legenda: ✅ pronto no código · 🟡 parcial · 🔴 pendente · 🏁 corrida TEF · 🔄 troca planejada

---

## Modelo operacional (Asa Sul)

**Sem funcionário no caixa.** O módulo **PDV gestor** (`/pdv-novo`) é back-office: fila de pedidos, cozinha, reimpressão de comanda — **não recebe pagamento** nem usa pinpad.

| Canal | Quem pede | Como paga | TEF / pagamento |
|-------|-----------|-----------|-----------------|
| **Totem** | Cliente | Pinpad no totem (cartão / PIX) | PayGo ou Payer (corrida TEF) |
| **Mesa / garçom** | Garçom (`/garcom`) | Conforme operação da loja* | Sem caixa físico no PDV gestor |
| **WhatsApp** | Cliente | **Pagamento online** (link / PIX) | Mercado Pago, Payer Web ou PIX API — **não pinpad** |

\* Mesa/garçom: pedido entra no sistema; cobrança pode ser no totem, link WhatsApp ou fluxo definido por loja — **nunca balcão com operador.**

**iFood** e delivery (Lalamove/Uber): integrados no código; homologar **só se** a loja usar.

---

## Plano: unificar as 3 ilhas (TEF · NFC-e · impressão)

Hoje o **Totem** (e o gestor) tratam pagamento, fiscal e impressão como **três fluxos separados**, sem rastreio único quando algo falha no meio.

### Situação atual (fragmentada)

| Ilha | Onde vive hoje | Problema |
|------|----------------|----------|
| **TEF** | Agente `:3030` → `useTefPayment` → `pdv_tef_transactions` | OK isolado; não amarra ao pedido de ponta a ponta |
| **NFC-e** | Edge `nfce-emit` (Focus) → `pdv_fiscal_invoices` | Totem chama `finalizeOrder` → TEF → depois `nfce-emit` manual/separado |
| **Impressão** | `routePrint` / agente `printUrl` / PDV gestor auto-comanda | Cupom NFC-e, comanda cozinha e reimpressão em caminhos diferentes |

**Sintoma:** pagamento aprovado, nota não sai, ou comanda não imprime — debug em 3 lugares (browser, Supabase, agente).

### Alvo: orquestrador de fechamento de venda

Um único fluxo **`closeOrder`** (hook + opcional edge) por canal, com **`closure_id`** / `correlation_id` em todas as etapas:

```
pdv_orders (criado)
    → pagamento (TEF totem | webhook WhatsApp/MP)
        → pdv_payments + pdv_tef_transactions
    → fiscal (NFC-e Focus)
        → pdv_fiscal_invoices
    → impressão (cupom DANFE + comanda cozinha)
        → log de impressão / agente printer
```

| Etapa | Totem | WhatsApp (online) |
|-------|-------|-------------------|
| Pagamento | TEF pinpad (agente) | Webhook MP / Payer Web |
| NFC-e | Focus após aprovação | Focus após webhook `APPROVED` |
| Impressão | Cupom no totem + comanda na impressora da loja | Comanda cozinha (cupom opcional digital) |

**Estados do fechamento:** `pending_payment` → `paid` → `fiscal_pending` → `fiscal_ok` → `print_pending` → `closed` | `failed_at_step` (com retry).

### Entregas de código (backlog unificação)

| # | Entrega | Onde | Prioridade |
|:-:|---------|------|:----------:|
| U1 | `closeOrder({ orderId, channel })` — orquestrador no front ou edge | `src/lib/order/` ou `supabase/functions/order-close/` | **Alta** (após TEF vencedor) |
| U2 | `closure_id` em `pdv_payments`, `pdv_tef_transactions`, `pdv_fiscal_invoices` | migration Supabase | Alta |
| U3 | Totem usa só `closeOrder` (remove lógica espalhada em `finalizeOrder`) | `src/pages/Totem.tsx` | Alta |
| U4 | WhatsApp/webhook dispara mesmo `closeOrder` pós-pagamento online | edge + `whatsapp-customer-*` | Média |
| U5 | Impressão unificada: `printOrderClosure({ orderId, targets: ['kitchen','customer'] })` | `src/lib/routePrint.ts` + agente | Média |
| U6 | Provider fiscal abstrato (`focus` \| `acbr_local`) — espelho do delivery factory | `_shared/fiscal/` | Baixa (pós-piloto) |
| U7 | Tela/status “fechamento do pedido” no PDV gestor (retry NFC-e / reimprimir) | `/pdv-novo` | Média |

### Onde entra no roadmap

| Fase | Item |
|:----:|------|
| **0** | TEF vencedor no totem |
| **1** | Totem homologado **como está** (ilhas separadas) — baseline |
| **1b** | **U1–U3** — unificar TEF + NFC-e + impressão no Totem | 🔧 plano engenharia |
| **2** | **U4** — mesmo orquestrador para WhatsApp pago online |
| **3** | **U7** — visibilidade e retry no gestor |

**Homologação:** critérios 5–7 do TEF passam a validar o **orquestrador** (não três testes manuais soltos).

---

## Plano de melhorias — passo a passo por prioridade

Visão única do piloto **Asa Sul**: o que fazer, em que ordem e quando considerar “pronto”.

### Visão geral (dependências)

```
P0 Infra + corrida TEF (paralelo)
        ↓
P1 Totem baseline (ilhas separadas, homologar 8 critérios)
        ↓
P2 Unificação closeOrder (U1–U5) + retry gestor (U7)
        ↓
P3 WhatsApp pago online (U4) + garçom/mesa
        ↓
P4 Piloto estável → DFe, instalador, trocas (Meta, ACBr…)
```

**Regra de ouro:** não codificar U1–U3 antes de **1 transação real** Totem→TEF→NFC-e→impressão no baseline (mesmo que manual). Senão o orquestrador encapsula bugs desconhecidos.

---

### P0 — Desbloquear TEF (corrida PayGo × Payer) · **AGORA**

Objetivo: uma das pistas passa nos critérios 1–4 (pagamento isolado) e está pronta para teste no Totem.

| Passo | Ação | Quem | Saída / critério de done |
|:-----:|------|------|--------------------------|
| 0.1 | Agente no PC do totem: `npm run start:console` ou atalho; pinpad COM5; `tefReady: true` | Operação | `GET :3030/health` ok |
| 0.2 | **PayGo:** limpar pendência antes de cada teste; CommTestePGWin (opcional) | Operação + Setis | Sem `-2582` recorrente |
| 0.3 | **PayGo:** débito/crédito **chip** (DEMO exige chip, não contactless) | Operação | Aprovação registrada |
| 0.4 | **PayGo:** PIX estável | Operação + Setis | 3 PIX seguidos ok |
| 0.5 | **Payer:** instalar Checkout Desktop + modo Localhost `:6060` | Suporte Payer | `/payer/diagnostics` ok |
| 0.6 | **Payer:** login sandbox + mesma bateria 0.3–0.4 | Operação | Paridade com PayGo |
| 0.7 | **Dev:** adicionar `payer` em `createTefAdapter` quando Payer estiver instalado | Dev | Totem usa factory, não só tela teste |
| 0.8 | Token Focus NFC-e (homolog/prod Asa Sul) validado | Fiscal/loja | `nfce-emit` autoriza nota teste |
| 0.9 | Impressora cupom + comanda configurada no agente | Operação | Teste impressão manual ok |

**Gate P0 → P1:** critérios TEF **1–4** ok em **PayGo ou Payer** + agente + Focus + impressora no totem.

---

### P1 — Totem ponta a ponta (baseline, ilhas separadas) · **após P0**

Objetivo: homologar critérios **5–8** com o fluxo **atual** (`Totem.tsx` → `finalizeOrder` → `nfce-emit` → print). Não refatorar ainda.

| Passo | Ação | Quem | Saída / critério de done |
|:-----:|------|------|--------------------------|
| 1.1 | Pedido completo no totem (cardápio → carrinho → pagamento) | Operação | `pdv_orders` criado |
| 1.2 | TEF no totem com provider vencedor da corrida | Operação | `pdv_payments` + `pdv_tef_transactions` |
| 1.3 | NFC-e automática pós-pagamento (Focus) | Operação + fiscal | `pdv_fiscal_invoices` autorizada |
| 1.4 | Cupom (DANFE) + comanda cozinha | Operação | Físico na impressora |
| 1.5 | Cancelamento / estorno TEF documentado | Operação | Procedimento escrito |
| 1.6 | Atualizar `pdv_tef_config.provider` = vencedor | Dev/ops | Só 1 TEF ativo |
| 1.7 | Evidências fornecedor (Setis **ou** Payer) | Operação | Checklist 8/8 assinado |

**Gate P1 → P2:** **8/8 critérios TEF** + 3 vendas reais totem sem intervenção manual no meio.

---

### P2 — Unificar ilhas (TEF · NFC-e · impressão) · **após P1**

Objetivo: um fluxo `closeOrder`, rastreável, com retry — critérios 5–7 passam a validar o orquestrador.

| Passo | Ação | Onde | Saída / critério de done |
|:-----:|------|------|--------------------------|
| 2.1 | **U2** Migration: `closure_id` + `closure_status` em pedido/pagamento/fiscal/TEF | Supabase | Colunas + índices |
| 2.2 | **U1** `closeOrder({ orderId, channel: 'totem' })` — estados: paid → fiscal → print → closed | `src/lib/order/` | Unit + log por etapa |
| 2.3 | **U5** `printOrderClosure({ targets })` — cupom + comanda num só lugar | `routePrint.ts` | Totem e gestor usam |
| 2.4 | **U3** Totem: substituir `finalizeOrder` por `closeOrder` | `Totem.tsx` | Diff pequeno, mesmo comportamento |
| 2.5 | Teste regressão: 3 vendas totem via orquestrador | Operação | Igual P1, menos falhas silenciosas |
| 2.6 | **U7** PDV gestor: painel fechamento (status, retry NFC-e, reimprimir) | `/pdv-novo` | Ops resolve sem DevTools |
| 2.7 | Agente `.exe` versionado com rotas TEF vencedor | Dev | Instalação totem sem Node |

**Gate P2 → P3:** falha simulada (NFC-e ou print) recuperável pelo gestor; `closure_id` rastreia toda venda.

---

### P3 — Outros canais (sem caixa) · **paralelo parcial após P1**

Objetivo: WhatsApp e mesa operando com a **mesma** regra de fechamento (idealmente pós-P2).

| Passo | Ação | Dependência | Saída / critério de done |
|:-----:|------|-------------|--------------------------|
| 3.1 | **Decisão:** pagamento WhatsApp = Mercado Pago link **ou** Payer Web | Negócio | Documentado em config loja |
| 3.2 | Homologar webhook pagamento aprovado → pedido pago | P2 ideal (U4) | Status `paid` automático |
| 3.3 | **U4** `closeOrder({ channel: 'whatsapp' })` pós-webhook | U1 | NFC-e + comanda cozinha |
| 3.4 | Z-API: fluxo pedido + link pagamento + confirmação | 3.1–3.3 | 1 pedido WhatsApp E2E |
| 3.5 | **Garçom/mesa:** definir regra cobrança (totem vs link) | Negócio | 1 página “como opera a mesa” |
| 3.6 | `/garcom` → cozinha (comanda); sem pagamento no gestor | 3.5 | Pedido mesa na fila PDV |

**Gate P3:** totem + pelo menos **1** canal remoto (WhatsApp) fechando venda com NFC-e.

---

### P4 — Piloto estável e evolução · **após P2–P3**

| Passo | Ação | Prioridade | Notas |
|:-----:|------|:----------:|-------|
| 4.1 | DFe entrada (Focus) + recebimento | Média | Back-office |
| 4.2 | Contingência NFC-e (retry, fila) | Média | Já parcial no código |
| 4.3 | **U6** Provider fiscal `focus \| acbr_local` | Baixa | Só se Focus for gargalo |
| 4.4 | iFood / Lalamove / Uber | Só se usar | Asa Sul pode pular |
| 4.5 | Migrar Z-API → Meta Cloud API | Baixa | Após piloto estável |
| 4.6 | Desativar UI TEF perdedor | Baixa | Manter fallback doc |
| 4.7 | Avaliações Google/iFood API | Baixa | Operacional hoje |

---

### Matriz: o que pode rodar em paralelo

| Trilha | Pode começar quando | Não misturar com |
|--------|---------------------|------------------|
| PayGo homolog | Agora (P0) | — |
| Payer homolog | Agora (P0) | — |
| Focus NFC-e token | Agora (P0) | — |
| Totem baseline (P1) | Gate P0 | Refactor closeOrder |
| closeOrder (P2) | Gate P1 | — |
| WhatsApp pagamento (P3) | Após decisão MP/Payer; código U4 após U1 | Antes de TEF vencedor |
| Garçom/mesa (P3) | Após regra de negócio 3.5 | — |

---

### Próximos 7 dias (sugestão concreta)

| Dia | Foco |
|:---:|------|
| 1–2 | P0.1–0.4 PayGo (chip + limpar pendência) **e** cobrar Payer 0.5–0.6 |
| 3 | P0.8 Focus + P0.9 impressora no totem |
| 4–5 | P1.1–1.4 primeiro E2E totem com provider que estiver na frente |
| 6 | Comparar PayGo vs Payer nos critérios 1–4; declarar vencedor ou empate |
| 7 | Se 8/8 em uma pista → P1.6 go-live TEF; senão continuar corrida |

**Dev (quando Payer instalar):** P0.7 factory `payer`. **Dev (após P1):** P2.1–2.4 unificação.

---

## Decisão: TEF (PayGo × Payer)

**Regra de produto:** a loja opera com **1 único TEF**, instalado no **Totem** (PC + pinpad). Não haverá PayGo e Payer ativos ao mesmo tempo.

**Estratégia atual:** homologar **PayGo** e **Payer em paralelo** (PayGo deu problemas; Payer é alternativa). **Quem concluir primeiro os critérios de go-live abaixo vira o TEF oficial** (`pdv_tef_config.provider`). O outro fica como fallback/documentação até desligar a UI de teste.

| Pista | Tela de teste | Setup | Status homologação |
|-------|---------------|-------|-------------------|
| **PayGo** (PGWebLib / Setis) | `/configuracoes/tef-paygo` | `electron-acbr/SETUP-TEF.md` | 🏁 PIX `-2582`, cartão timeout — insistir |
| **Payer** (API Localhost) | `/configuracoes/tef-payer` | `electron-acbr/SETUP-PAYER.md` | 🏁 aguardando Checkout `:6060` |

**Em produção (por loja):** `pdv_tef_config.provider` = `paygo` **ou** `payer` — nunca os dois.

---

## Critérios para oficializar o TEF vencedor

Todos os itens abaixo devem estar **OK** antes de trocar o provider na loja:

| # | Critério | PayGo | Payer |
|:-:|----------|:-----:|:-----:|
| 1 | Débito à vista (chip) aprovado | ☐ | ☐ |
| 2 | Crédito à vista aprovado | ☐ | ☐ |
| 3 | PIX estável (sem queda de conexão recorrente) | ☐ | ☐ |
| 4 | Cancelamento / limpar pendência | ☐ | ☐ |
| 5 | Fluxo **Totem**: pedido → TEF → `pdv_payments` | ☐ | ☐ |
| 6 | NFC-e após pagamento (Focus) | ☐ | ☐ |
| 7 | Cupom + comanda imprimindo | ☐ | ☐ |
| 8 | Homologação do fornecedor (Setis **ou** Payer) | ☐ | ☐ |

**Vencedor:** primeira pista com **8/8** → atualizar `pdv_tef_config` → comunicar equipe → congelar investimento na pista perdedora (manter só teste mínimo).

---

## Corrida TEF — plano paralelo

```
PayGo (Setis)                    Payer (Localhost)
────────────────                 ─────────────────
Limpar pendência / host          Instalar Checkout + modo Localhost
CommTestePGWin (teste isolado)   Login sandbox + /payer/diagnostics
Débito / crédito / PIX           Mesma bateria de testes
Roteiro Setis + evidências       Roteiro Payer (suporte)
         ↘                       ↙
              8 critérios go-live
                    ↓
         provider oficial na Asa Sul
```

---

## Roadmap geral (após TEF definido)

| Fase | # | O quê | Status código | Homologar | Bloqueio |
|:----:|:-:|-------|:-------------:|:---------:|----------|
| **0** | — | **TEF vencedor (PayGo ou Payer) no Totem** | 🏁 | 🏁 | Ver corrida acima |
| **1** | 1 | Totem ponta a ponta (pedido + TEF + NFC-e) | 🟡 | 🔴 | TEF vencedor |
| **1b** | — | **Unificar ilhas** TEF + NFC-e + impressão (`closeOrder`) | 🔧 | 🔴 | Item 1 baseline |
| **1** | 2 | Agente local no PC do totem | ✅ | 🟡 | — |
| **1** | 3 | Garçom / mesa (`/garcom`) → cozinha | 🟡 | 🔴 | Fluxo mesa definido |
| **2** | 4 | **WhatsApp pedido + pagamento online** | 🟡 | 🔴 | Link/PIX (MP ou Payer) |
| **2** | 5 | NFC-e emissão (Focus) | ✅ | 🔴 | Token Focus |
| **2** | 6 | Impressora cupom + comanda (totem/gestor) | 🟡 | 🔴 | Hardware loja |
| **3** | 7 | PDV gestor: fila, comanda, sem pagamento | ✅ | 🟡 | Validar operação |
| **4** | 8 | DFe entrada (Focus) + recebimento | ✅ | 🔴 | Token Focus |
| **—** | — | iFood / Lalamove / Uber | ✅ | — | Só se loja usar |
| **5** | 9 | Avaliações Google / iFood | 🟡 manual | 🔴 | Operacional |

---

## Mapa por área

### Totem + pinpad (único TEF físico)

| Integração | Temos | Homologar | Produção |
|------------|:-----:|:---------:|----------|
| **PayGo** PGWebLib | 🟡 | 🏁 | 🏁 candidato |
| **Payer** Localhost | 🟡 | 🏁 | 🏁 candidato |
| SiTef | 🟡 | — | Não usar agora |
| Agente `electron-acbr` | ✅ | 🟡 | 🔄 instalador `.exe` |

### Fiscal

| Integração | Temos | Homologar | Futuro |
|------------|:-----:|:---------:|--------|
| NFC-e venda — **Focus NFe** | ✅ | 🔴 | 🔄 SEFAZ direto ou ACBr local |
| NFC-e local — **ACBr** (agente) | 🟡 | 🔴 | Alternativa ao Focus |
| DFe notas entrada — Focus | ✅ | 🔴 | 🔄 junto com NFC-e |
| Contingência / retry | ✅ | 🔴 | — |

### Canais de pedido (Asa Sul)

| Canal | Temos | Homologar | Pagamento |
|-------|:-----:|:---------:|-----------|
| **Totem** | ✅ | 🔴 | TEF (PayGo/Payer) |
| **Garçom / mesa** | 🟡 `/garcom` | 🔴 | Sem caixa; ver operação mesa |
| **WhatsApp** | ✅ | 🔴 | **Online** (link/PIX) |
| PDV gestor (`/pdv-novo`) | ✅ | 🟡 | **Não recebe** — só operação |
| iFood | ✅ | — | Opcional |
| Cardápio Supabase | ✅ | — | — |

### Pagamento online (WhatsApp e remotos)

| Integração | Temos | Homologar | Futuro |
|------------|:-----:|:---------:|--------|
| Mercado Pago (link) | ✅ | 🔴 | Candidato imediato |
| Payer Checkout Web / PIX API | 🔴 | 🔴 | 🔄 unificar com TEF Payer |
| WhatsApp — **Z-API** | ✅ | 🔴 | 🔄 **Meta Cloud API** |
| WhatsApp IA + pedido | ✅ | 🔴 | Meta |

### Entregas

| Integração | Temos | Homologar | Futuro |
|------------|:-----:|:---------:|--------|
| Lalamove | ✅ | 🔴 | Manter |
| Uber Direct | ✅ | 🔴 | Manter |
| Mock (dev) | ✅ | — | — |

### Reputação

| Integração | Temos | Homologar | Futuro |
|------------|:-----:|:---------:|--------|
| Google avaliações | 🟡 manual | 🔴 | 🔄 API Google Business |
| iFood avaliações | 🟡 manual | 🔴 | 🔄 API iFood |
| IA sugestão de resposta | ✅ | 🟡 | — |

### Back-office (homologar quando usar)

| Integração | Temos |
|------------|:-----:|
| Saipos sync | ✅ |
| E-mail transacional | ✅ |
| RH / folha / ponto | ✅ |
| Compras / fornecedores | ✅ |
| EMS temperatura | ✅ |

---

## Trocas planejadas (depois do piloto estável)

```
┌─────────────────┬──────────────────────────┬─────────────────────────────┐
│ HOJE            │ FUTURO                   │ POR QUÊ                     │
├─────────────────┼──────────────────────────┼─────────────────────────────┤
│ Z-API           │ Meta WhatsApp Cloud API  │ Oficial, escala, política   │
│ Focus NFe       │ SEFAZ direto / ACBr      │ Custo, contingência, controle│
│ TEF perdedor    │ (desativar UI / fallback)│ Só 1 TEF em produção        │
│ 3 ilhas separadas │ Orquestrador closeOrder │ Debug, retry, WhatsApp = Totem │
│ Mercado Pago    │ Payer Checkout Web       │ Unificar pagamentos         │
│ Reviews manual  │ Google + iFood API       │ Automação                   │
└─────────────────┴──────────────────────────┴─────────────────────────────┘
```

**Não migrar Focus/Meta antes de:** TEF oficial definido + NFC-e emitindo na Asa Sul.

---

## Gargalos atuais

| Pista | Item | Situação |
|-------|------|----------|
| **PayGo** | Host sandbox / pendência `482863` | PIX `-2582`; limpar pendência antes de cada teste |
| **PayGo** | Cartão DEMO | Exige chip; contactless dá timeout |
| **Payer** | Checkout Desktop | Não instalado (`:6060` vazio) |
| **Payer** | Credenciais sandbox | Pendente suporte |
| **Totem** | Fluxo completo homologado | TEF + NFC-e + cupom no totem |
| **Arquitetura** | 3 ilhas sem `closure_id` | Unificação U1–U3 no backlog |
| **WhatsApp** | Pagamento online | Definir MP vs Payer Web; homologar webhook |
| **Fiscal** | Token Focus NFC-e | Validar homolog/prod Asa Sul |

---

## Referências no repo

| Tema | Arquivo |
|------|---------|
| Setup Payer | `electron-acbr/SETUP-PAYER.md` |
| Índice doc Payer | `electron-acbr/PAYER-DOCS-INDEX.md` |
| Setup PayGo | `electron-acbr/SETUP-TEF.md` |
| TEF factory (Totem) | `src/lib/tef/` · `src/pages/Totem.tsx` |
| Impressão / comanda | `src/lib/routePrint.ts` · `src/lib/printOrder.ts` |
| Totem (fluxo atual) | `src/pages/Totem.tsx` → `finalizeOrder` |
| Plano unificação | esta seção **Plano: unificar as 3 ilhas** |
| **Mapa hardcodes** | `docs/HARDCODES.md` |
| Garçom | `src/pages/` → rota `/garcom` |
| Entregas | `src/pages/DeliverySettings.tsx` |
| NFC-e Focus | `supabase/functions/nfce-emit/` |
| WhatsApp | `supabase/functions/send-whatsapp/` |

---

## Checklist — Asa Sul

### Corrida TEF (paralelo)

**PayGo** (`/configuracoes/tef-paygo`)

- [ ] CommTestePGWin ok (opcional, isola ambiente)
- [ ] Limpar pendência antes de cada teste
- [ ] Débito / crédito / PIX
- [ ] Cancelamento
- [ ] Critérios 5–8 (**Totem** + NFC-e + cupom + Setis)

**Payer** (`/configuracoes/tef-payer`)

- [ ] Checkout instalado (Localhost `:6060`) no PC do totem
- [ ] Login sandbox
- [ ] Débito / crédito / PIX
- [ ] Cancelamento / abort
- [ ] Critérios 5–8 (**Totem** + NFC-e + cupom + Payer)

**Go-live TEF**

- [ ] Vencedor definido → `pdv_tef_config.provider` atualizado
- [ ] Agente + pinpad no **totem** (não no PDV gestor)
- [ ] Equipe avisada qual TEF está oficial

### Canais (sem caixa)

**Totem**

- [ ] Cliente monta pedido → paga no pinpad → NFC-e → cupom

**Garçom / mesa** (se usar)

- [ ] Pedido `/garcom` → comanda cozinha
- [ ] Regra de cobrança definida (totem vs link WhatsApp)

**WhatsApp**

- [ ] Atendimento + pedido
- [ ] **Pagamento online** (MP link ou Payer Web/PIX) confirmado via webhook
- [ ] NFC-e após pagamento aprovado

**PDV gestor**

- [ ] Fila, comanda, reimpressão — **sem** fluxo de pagamento

### Unificação TEF + NFC-e + impressão (backlog eng.)

- [ ] U1 — `closeOrder` orquestrador
- [ ] U2 — `closure_id` nas tabelas de pagamento/fiscal/TEF
- [ ] U3 — Totem refatorado para um único fluxo
- [ ] U4 — WhatsApp pago online usa o mesmo orquestrador
- [ ] U5 — impressão centralizada (cupom + comanda)
- [ ] U7 — retry/status no PDV gestor

### Restante do piloto

- [ ] NFC-e autorizada (Focus homolog)
- [ ] Cupom + comanda imprimindo
- [ ] (Opcional) iFood / delivery
