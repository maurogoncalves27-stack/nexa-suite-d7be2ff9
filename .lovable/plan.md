## Objetivo

Construir o **NEXA Garçom**, app Android nativo-web rodando no **Gertec GPOS780 Multi** com pagamento via **PayGo Integrado**, para garçons abrirem mesa, lançar pedidos por rodada, mandar para cozinha (KDS) e cobrar no próprio terminal.

Substitui o alvo Stone S920/PlugPag (memória `smartpos-hardware-alvo` será atualizada). iFood segue como prioridade — este projeto roda em paralelo porque já estamos pré-homologados.

## Hardware e integração de pagamento

- **Gertec GPOS780 Multi**: Android, tela 5,5", impressora térmica integrada, leitor de cartão/NFC, bateria.
- **PayGo Integrado**: SDK Android oficial da PayGo (ex-Setis), suporta crédito/débito/PIX/voucher, certificado pela Bin (Elavon). Roda como serviço local no próprio aparelho — não precisa de pinpad externo.
- App web carregado dentro de **WebView Android** (wrapper Capacitor) chamando a SDK via plugin nativo Java/Kotlin.

## Fases

### Fase 1 — Modelo de mesa/comanda (banco + UI mock)
Tabelas novas: `pdv_tables` (numero, lugares, area, status), `pdv_table_sessions` (mesa × abertura × garçom × status), `pdv_table_rounds` (rodadas/comandas dentro da sessão).
Reaproveita `pdv_orders` (1 order por sessão fechada) e `pdv_order_items` (com `round_id`).

Tela `/garcom` mobile-first (otimizada 360–480px):
- Login do garçom (Supabase auth, role `waiter` nova).
- **Mapa de mesas** (grid colorido: livre/ocupada/conta pedida/aguardando pagto).
- **Abrir mesa** → escolhe nº de pessoas → cria sessão.
- **Lançar rodada**: catálogo (reusa `menu_items`+`menu_categories` filtrado por loja virtual da mesa) → carrinho → "Enviar para cozinha".
- **Ver conta**: agrupa itens por rodada, mostra total, opção de dividir.
- **Fechar mesa** → cobra (chama PayGo) → imprime cupom → libera mesa.

TEF ainda em modo `mock` nesta fase.

### Fase 2 — KDS (Kitchen Display)
Tela `/kds` para a cozinha receber rodadas em tempo real (realtime Supabase em `pdv_table_rounds`). Botões: "Preparando" / "Pronto". Notifica garçom (sino) quando pronto.
Aproveita o plano já parqueado em `mem://features/kds-roadmap`.

### Fase 3 — Camada PayGo (adapter)
- Criar `src/lib/tef/paygoAdapter.ts` implementando `TefAdapter` (interface já existe em `src/lib/tef/types.ts`).
- O adapter chama uma ponte JS `window.NexaPayGo` exposta pelo wrapper Android.
- Atualizar `src/lib/tef/index.ts` para mapear `provider="paygo"` → `createPaygoAdapter`.
- Adicionar registros em `pdv_tef_config` por loja com `provider='paygo'`.
- Reusar `pdv_tef_transactions` para auditoria (já existe).

### Fase 4 — Wrapper Android (Capacitor) + plugin PayGo
- Novo diretório `android-garcom/` com projeto Capacitor.
- Plugin nativo Kotlin que importa o **AAR/SDK PayGo Integrado** (download via portal PayGo Dev — pedirei o arquivo ao usuário).
- Plugin expõe: `transact({amount, method})`, `cancel()`, `printReceipt(text)` (impressora Gertec) — bridge para `window.NexaPayGo`.
- Build APK assinada, instala no GPOS780 via USB/OTA.
- Ícone NEXA oficial (`icones/nexa_icone.png`) — regra da memória.

### Fase 5 — Homologação PayGo + piloto
- Rodar checklist de homologação PayGo (transações de teste em ambiente Bin pré-prod).
- Piloto em 1 loja (sugestão Asa Norte, único canal Salão hoje).

## Banco — migração nova (Fase 1)

```sql
CREATE TABLE public.pdv_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  number int NOT NULL,
  label text,
  seats int NOT NULL DEFAULT 4,
  area text,                       -- 'salao','varanda','balcao'
  is_active bool NOT NULL DEFAULT true,
  UNIQUE(store_id, number)
);

CREATE TABLE public.pdv_table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES pdv_tables(id),
  store_id uuid NOT NULL,
  waiter_id uuid REFERENCES auth.users(id),
  guests int DEFAULT 1,
  status text NOT NULL DEFAULT 'open',  -- open|bill_requested|paid|cancelled
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  order_id uuid REFERENCES pdv_orders(id)
);

CREATE TABLE public.pdv_table_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES pdv_table_sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  status text NOT NULL DEFAULT 'sent',  -- sent|preparing|ready|delivered|cancelled
  sent_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  delivered_at timestamptz
);
-- + GRANT, RLS por loja, realtime nas duas últimas.
```

Mais: nova role `waiter` em `user_roles` e helper `is_waiter()`.

## O que NÃO está no escopo (parqueado)

- Pagamento em dinheiro (regra `/pdv-novo`: zero dinheiro físico).
- Divisão por pessoa com múltiplas leituras de cartão em sequência (Fase 6).
- Comanda por QR Code do cliente (Fase 7).

## O que vou precisar do usuário antes de codar

1. **SDK PayGo Integrado** (`.aar` + manual) baixado de https://paygodev.readme.io — só você tem acesso ao portal.
2. Confirmar a **loja-piloto** (sugiro Asa Norte).
3. Confirmar se a mesa está **só no salão** ou também atende balcão/varanda/delivery.
4. Atualizar a memória `smartpos-hardware-alvo` (Stone → Gertec+PayGo) — eu faço assim que aprovar.

## Próximo passo concreto se aprovar

Começo pela **Fase 1** (migração `pdv_tables`/`pdv_table_sessions`/`pdv_table_rounds` + tela `/garcom` com TEF mock) — entrega visível em ~1 ciclo, sem encostar em iFood nem no PDV atual.