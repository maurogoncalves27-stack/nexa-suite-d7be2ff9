## Problema

Sensor da Câmara Fria da ASA SUL disparou 3 alertas OFFLINE em ~2 h (04:30, 05:40, 06:50) e 2 mensagens de NORMALIZADA em 10 min (07:20 e 07:30), violando as regras que já estão no código (cooldown 3 h, máx. 2 problemas/dia, 1 normalização por evento).

## Causa raiz

Em `supabase/functions/ems-temperature-alert-check/index.ts`:

1. **Cooldown olha só `openAlert`** (alertas com `resolved_at IS NULL`). Quando o sensor pisca ("volta online" por uma leitura) o alerta anterior é resolvido → não existe mais openAlert → o próximo OFFLINE dispara **imediatamente**, sem respeitar as 3 h.
2. **Recovered não tem cooldown nem dedup**: toda transição para "ok" envia WhatsApp, então oscilar rápido gera várias NORMALIZADAS.
3. **Daily cap** (`MAX_PROBLEM_ALERTS_PER_DAY = 2`) usa `dayStart` em horário do servidor (UTC). Em BRT isso equivale a "desde 21:00 do dia anterior" — inofensivo isoladamente, mas somado ao bug 1 permite estourar o limite.

## Correções (só nesse arquivo edge)

1. Trocar a lógica de cooldown: em vez de só `openAlert`, buscar o **último alerta do mesmo `kind`** (resolvido ou não) nas últimas 3 h. Se existir, pular. Isso mantém o silêncio mesmo depois de uma normalização.
2. Aplicar **cooldown também no `recovered`**: só enviar mensagem de normalização se:
   - existir um alerta de problema aberto para resolver, **e**
   - não houver outro `recovered` para o mesmo sensor nos últimos 30 min.
   Caso contrário, apenas resolver o registro no banco silenciosamente.
3. Ajustar `dayStart` para America/Sao_Paulo (subtrair offset) para que o cap de 2/dia respeite o dia local.
4. Ao pular por cooldown/cap, **não** criar novo registro em `nutri_temperature_alerts` (hoje já não cria, só devolve `skipped` — manter).

## Detalhes técnicos

- Nova consulta antes do envio de problema:
  ```ts
  const cooldownStart = new Date(Date.now() - REPEAT_COOLDOWN_MIN * 60_000).toISOString();
  const { data: recentSame } = await supabase
    .from("nutri_temperature_alerts")
    .select("id, triggered_at")
    .eq("sensor_code", sensor.unique_code)
    .eq("kind", kind)
    .gte("triggered_at", cooldownStart)
    .limit(1);
  if (recentSame?.length) { results.push({ sensor: sensor.unique_code, kind, skipped: "cooldown_last_alert" }); continue; }
  ```
- Nova checagem de recovered (constante `RECOVERED_DEDUP_MIN = 30`):
  ```ts
  const dedupStart = new Date(Date.now() - RECOVERED_DEDUP_MIN * 60_000).toISOString();
  const { data: recentRecovered } = await supabase
    .from("nutri_temperature_alerts")
    .select("id")
    .eq("sensor_code", sensor.unique_code)
    .eq("kind", "recovered")
    .gte("triggered_at", dedupStart)
    .limit(1);
  const shouldNotifyRecovered = !recentRecovered?.length;
  ```
  Só percorrer `recipients` e chamar `uazapi-send-text` se `shouldNotifyRecovered`. Continuar inserindo/atualizando registros para auditoria.
- `dayStart` em BRT: usar `new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"}))` e zerar horas, depois `toISOString()` para query.

## Fora de escopo

- Não muda cron (`*/10 min`), não altera limites configurados dos sensores, não mexe em `ems-sync-temperature`, não altera UI. Apenas a edge function de alerta.

## Como validar

- Rodar 3 execuções seguidas simulando `offline → ok → offline` e confirmar que só o 1º OFFLINE gera WhatsApp e o 2º cai em `skipped: cooldown_last_alert`.
- Simular `ok → offline → ok → offline → ok` em 15 min e confirmar 1 única mensagem de NORMALIZADA.
- Conferir em `nutri_temperature_alerts` que o cap diário passa a ser respeitado por dia BRT.
