## Contexto

Depois do último ajuste ainda chegam alertas OFFLINE a cada ~1h10 e mais de uma NORMALIZADA por evento. O objetivo agora é reforçar as regras especificamente para o caso "sem energia" (offline) e garantir uma única normalização por evento.

## Regras finais (edge `ems-temperature-alert-check`)

1. **Offline (sem energia)** — máximo 1 alerta a cada 3 h por sensor, e no máximo 2 alertas de problema por dia (regra que já existe). O cooldown considera o último alerta do mesmo `kind`, resolvido ou não (já implementado, precisa validar deploy).
2. **Normalização (recovered)** — só envia mensagem se houve **um novo alerta de problema (out_of_range OU offline) disparado APÓS a última mensagem recovered**. Ou seja: uma normalização por ciclo problema→ok, nunca duas seguidas, independentemente do intervalo.
3. Continua registrando tudo em `nutri_temperature_alerts` para auditoria; a supressão é só do WhatsApp/SMS.

## Mudanças de código

Arquivo único: `supabase/functions/ems-temperature-alert-check/index.ts`

- Substituir o dedup de recovered atual (janela de 30 min) por: buscar o último registro `kind='recovered'` do sensor; se existir, buscar se há algum registro `kind in ('out_of_range','offline')` **depois** desse `triggered_at`. Só notifica se houver.
  ```ts
  const { data: lastRecovered } = await supabase
    .from("nutri_temperature_alerts")
    .select("triggered_at")
    .eq("sensor_code", sensor.unique_code)
    .eq("kind", "recovered")
    .order("triggered_at", { ascending: false })
    .limit(1);
  let shouldNotifyRecovered = true;
  if (lastRecovered?.length) {
    const { count: problemsSince } = await supabase
      .from("nutri_temperature_alerts")
      .select("id", { count: "exact", head: true })
      .eq("sensor_code", sensor.unique_code)
      .in("kind", ["out_of_range", "offline"])
      .gt("triggered_at", lastRecovered[0].triggered_at);
    shouldNotifyRecovered = (problemsSince ?? 0) > 0;
  }
  ```
- Manter cooldown de 3 h para offline exatamente como está (já cobre "sem energia").
- Nenhuma mudança em UI, cron ou tabelas.

## Validação

- Simular ok → offline → ok → ok: 1 offline + 1 recovered. Próximo "ok → ok" não gera outra recovered.
- Simular offline persistente por 6 h: no máx 2 mensagens offline (respeita cap diário + cooldown 3 h).
- Simular offline → ok → offline dentro de 3 h: 1 offline apenas.
