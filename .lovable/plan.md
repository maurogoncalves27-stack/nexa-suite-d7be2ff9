## Auditoria (já feita)

Vasculhei `ems-ingest`, `ems-sync-temperature`, `NutriTemperatureControl.tsx` e `ColdChamberStatusCard.tsx`. Resultado:

**Nunca existiu disparo de alerta automático para temperatura fora da faixa.**

- `ems-ingest` (cron 5min) só grava leituras em `ems_sensor_readings`.
- `ems-sync-temperature` só copia para `nutri_temperature_readings`.
- O "alerta" hoje é **apenas visual**: badge/número em vermelho quando `temp > max_value` (ou `< min_value`). Nenhum push, nenhum WhatsApp, nenhum registro de incidente.
- Sensor cadastrado: 1 só — **Câmara Fria · Asa Sul** (faixa −25°C a −5°C).

Por isso "os alertas não estão chegando": eles nunca foram enviados.

## O que vou implementar

Alertas via **WhatsApp** (Z-API, mesma infra do `send-whatsapp`) — sem push.

### 1. Banco
- Nova tabela `nutri_temperature_alert_recipients` (`store_id` nullable = recebe de todas as lojas, `phone`, `name`, `active`).
- Nova tabela `nutri_temperature_alerts` para auditoria + dedup: `sensor_code`, `store_id`, `triggered_at`, `last_temperature`, `kind` (`out_of_range` | `offline` | `recovered`), `notified_phones jsonb`, `resolved_at`.
- RLS: admin/manager/nutritionist gerenciam destinatários e leem alertas.
- GRANT padrão.

### 2. Edge function `ems-temperature-alert-check`
Roda a cada 10 min via pg_cron. Para cada sensor ativo com `min_value`/`max_value` definidos:
- Pega última leitura.
- Calcula estado: `out_of_range` (fora dos limites), `offline` (sem leitura > 30 min) ou `ok`.
- **Histerese / anti-spam:** só dispara novo alerta do mesmo `kind` se o último ainda não foi resolvido e tem ≥ 60 min, OU se mudou de estado.
- Quando volta ao normal, marca o alerta aberto como `resolved_at = now()` e envia mensagem de "normalizado".
- Para cada destinatário (loja específica + globais), chama `send-whatsapp` e registra retorno em `notified_phones`.

### 3. Cron
`select cron.schedule('ems-temperature-alert-check', '*/10 * * * *', $$select net.http_post(...)$$);`

### 4. UI
Pequena seção em **NutriControle → Controle de Temperatura** (visível para admin/manager/nutritionist) para gerenciar destinatários WhatsApp da loja: adicionar nome/telefone, ativar/desativar, ver últimos 10 alertas enviados.

### Mensagem de exemplo
```
🚨 Câmara Fria · Asa Sul
Temperatura FORA da faixa: -3.2°C
(limites: -25°C a -5°C)
Há 7 min · 25/06 13:42
```

Pré-requisitos já atendidos: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` (usados pelo `send-whatsapp`).

Sigo com a implementação?
