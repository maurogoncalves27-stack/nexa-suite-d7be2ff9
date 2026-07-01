# Sensores Tuya Wi-Fi → Câmaras Frias (integração com NutriControle)

## Objetivo

Ler temperatura/umidade dos 3 sensores Tuya Wi-Fi (Smart Life) via Tuya Cloud API, gravar automaticamente em `nutri_temperature_readings` e disparar alertas quando sair da faixa — reaproveitando toda a infra que já existe no NutriControle (alertas, destinatários, WhatsApp, sino).

Piloto: **Asa Sul, 3 sensores** (você define quais câmaras na hora do cadastro).

---

## Passo a passo Tuya (você faz, ~10 min)

Antes de eu implementar, preciso que você crie o projeto Cloud da Tuya. Faço um guia enxuto:

1. **App Smart Life no celular**: parear os 3 sensores no Wi-Fi da loja (seguir o folheto — QR code + Add Device). Anotar o nome que der pra cada um (ex: "Câmara Congelados", "Câmara Resfriados", "Estoque Seco").
2. **Conta Tuya IoT**: acessar `iot.tuya.com` → criar conta com o mesmo e-mail do app Smart Life.
3. **Cloud → Development → Create Cloud Project**:
   - Industry: *Smart Home*
   - Development Method: *Smart Home*
   - Data Center: *America* (latência menor pro Brasil)
4. Na aba **Service API** do projeto, autorizar: `IoT Core` + `Authorization` + `Smart Home Basic Service`.
5. Aba **Devices → Link Tuya App Account → Add App Account**: escanear QR com o app Smart Life. Isso "importa" os 3 sensores pro projeto Cloud.
6. Aba **Overview**: copiar `Access ID/Client ID` e `Access Secret/Client Secret`.

Quando terminar, me avisa que eu peço os 3 secrets (`TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_DATA_CENTER`) via formulário seguro.

---

## O que vou construir

### 1. Schema (migration única)

Nova tabela `tuya_sensors` (mapeia device_id Tuya → câmara/loja):
- `store_id` (fk stores), `equipment_id` (fk nutri_equipment, opcional), `tuya_device_id` (unique), `label` (ex: "Câmara Congelados"), `sensor_type` (`freezer` | `chiller` | `dry` | `custom`), `min_temp_c`, `max_temp_c`, `max_humidity_pct`, `alert_delay_minutes` (default 15 — só alerta se ficar fora da faixa por X min contínuos), `active` (bool), `last_reading_at`, `last_temp_c`, `last_humidity_pct`, `last_online` (bool).
- RLS: leitura para autenticados da loja; escrita apenas admin/nutricionista/super.
- GRANTs pros 3 roles conforme regra do projeto.

**Não** duplico leituras: continuam indo pra `nutri_temperature_readings` (source = 'tuya') e alertas pra `nutri_temperature_alerts` — o painel do NutriControle já mostra tudo.

### 2. Edge functions

- **`tuya-sync`** (agendada, cron a cada 5 min via pg_cron + pg_net):
  - Lê secrets, gera token Tuya (HMAC-SHA256 do sign), lista devices ativos, puxa status (`GET /v1.0/devices/{id}/status`), grava `temp_current` e `humidity_value` em `nutri_temperature_readings`, atualiza `tuya_sensors.last_*`.
  - Se leitura fora da faixa por > `alert_delay_minutes` consecutivos → cria `nutri_temperature_alerts` (dedup por sensor+dia) → chama `whatsapp-send` pros destinatários já configurados em `nutri_temperature_alert_recipients`.
  - Se `last_reading_at` > 30 min → marca `last_online=false` e alerta "sensor offline".
- **`tuya-list-devices`** (on-demand, chamada da UI de cadastro): lista devices do projeto Tuya pra você escolher qual vira qual câmara sem precisar digitar device_id manualmente.

### 3. Frontend

Nova página **`/nutricontrole/sensores`** (submenu do NutriControle):
- Cabeçalho padrão (h1 + ícone Thermometer text-primary + descrição).
- Grid mobile-first de cards: 1 card por sensor com temp/umidade em tempo real, badge de status (verde OK / amarelo alerta / vermelho crítico / cinza offline), gráfico das últimas 24h (sparkline recharts), botão "Configurar" (abre dialog com faixas e destinatários).
- Botão "Adicionar sensor" → dialog chama `tuya-list-devices` → mostra devices não cadastrados → você escolhe loja + tipo (freezer/chiller/etc, preenche faixa padrão) → salva em `tuya_sensors`.
- Filtro por loja (piloto começa só com Asa Sul cadastrada).

Sidebar: adicionar item "Sensores" dentro do grupo NutriControle (ícone Thermometer, casando com o h1). Atualizar `PAGE_TITLES` em `AppLayout.tsx`.

### 4. Faixas padrão (editáveis por sensor)

| Tipo | Min °C | Max °C |
|---|---|---|
| Freezer/Congelados | -25 | -15 |
| Chiller/Resfriados | 0 | 5 |
| Seco | 15 | 25 |

---

## Detalhes técnicos

- **Auth Tuya**: token via `POST /v1.0/token?grant_type=1` com assinatura HMAC-SHA256 (`client_id + access_token(vazio no login) + timestamp + nonce + stringToSign`). Token válido 2h → cache in-memory dentro da edge function (recria a cada invocação está OK dado o cron de 5min).
- **Endpoint**: `https://openapi.tuyaus.com` (data center US, menor latência BR).
- **Cron**: `select cron.schedule('tuya-sync', '*/5 * * * *', ...)` chamando a edge function com anon key (function é pública com validação interna).
- **Design system**: tudo em tokens (`success`, `warning`, `destructive`, `muted`, `primary`), sem cores hex/tailwind hardcoded.
- **Mobile-first**: cards empilham no 427px, dialog rolável, tabela vira lista.

---

## Fora deste plano

- App Smart Life continua funcionando em paralelo (não desativa) — a Tuya Cloud lê os mesmos devices.
- Comando remoto (ligar/desligar câmara) não entra: sensor só reporta leitura.
- Automação "se subir de X, aciona compressor" fica pra depois.
- Integração LocalTuya (sem cloud) fica de plano B se você mudar de ideia.

---

## Ordem de execução (depois de aprovar)

1. Migration `tuya_sensors` + cron placeholder.
2. Peço os 3 secrets Tuya via formulário seguro.
3. Deploy `tuya-list-devices` + `tuya-sync` + agendo o cron.
4. Página `/nutricontrole/sensores` + sidebar + PAGE_TITLES.
5. Você cadastra os 3 sensores pela UI, escolhe faixas, e a partir do próximo tick de 5min começa a alimentar leituras e alertas automaticamente.
