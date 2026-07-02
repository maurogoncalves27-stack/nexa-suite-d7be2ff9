## Monitoramento WAN Mikrotik das 4 lojas

Objetivo: saber em tempo real quando a WAN principal cair (troca pro 4G) e quando voltar, com alerta no sino do Nexa e no WhatsApp dos responsáveis.

### Como vai funcionar

```text
┌─────────────────────────┐        ┌──────────────────────────┐
│ Mikrotik (loja)         │        │ Nexa (Lovable Cloud)     │
│                         │        │                          │
│ Netwatch monitora 8.8.8 │  POST  │ edge: mikrotik-wan-alert │
│ pela WAN principal      │──────▶ │  (valida token da loja,  │
│                         │        │   grava evento, dispara  │
│ on-down/on-up executam  │        │   sino + WhatsApp)       │
│ /tool fetch → webhook   │        │                          │
│                         │        │ cron 5min: heartbeat-    │
│ Scheduler a cada 2min   │  POST  │  check (silêncio > 6min  │
│ manda "heartbeat"       │──────▶ │  = Mikrotik/link total   │
│                         │        │  offline → alerta)       │
└─────────────────────────┘        └──────────────────────────┘
```

Netwatch já é nativo do RouterOS e não custa nada. O Mikrotik só precisa da saída de internet liberada (o que já acontece hoje). Nenhuma porta precisa ser aberta.

### Entregas

**1. Banco (Lovable Cloud)**
- `network_devices`: 1 linha por Mikrotik (store_id, nome, `webhook_token` único, WAN principal/secundária esperada, último heartbeat, status atual, IP público visto).
- `network_wan_events`: histórico (device_id, tipo `wan_down`/`wan_up`/`failover`/`recovery`/`heartbeat_lost`/`heartbeat_ok`, wan_ativa, duração da queda, payload cru).
- `network_alert_recipients`: quem recebe WhatsApp por loja (nome, telefone E.164, ativo).
- RLS: leitura/escrita só para admin/gestor; edge functions usam service role.

**2. Edge functions**
- `mikrotik-wan-alert` (público, valida `webhook_token`): recebe POST do Netwatch, grava evento, atualiza status do device, dispara notificação no sino (função existente) e WhatsApp (canal existente) se for `wan_down` ou `wan_up`. Faz debounce (ignora flap < 60s).
- `mikrotik-heartbeat-check` (cron a cada 5min via pg_cron): marca device como `offline` se último heartbeat > 6min e dispara alerta "Mikrotik ou links totalmente fora".

**3. Página /configuracoes/rede-lojas** (admin)
- Card por loja: status atual (WAN1 OK / usando 4G / offline), última troca, uptime da WAN principal nos últimos 7/30 dias, IP público atual.
- Timeline dos últimos eventos por loja.
- Botão "Copiar script Mikrotik" que gera o RouterOS script já preenchido com URL do webhook + token da loja (netwatch on-up/on-down + scheduler de heartbeat). Instruções passo a passo pra colar no Winbox/WebFig.
- Aba "Destinatários de alerta" para cadastrar telefones que recebem WhatsApp.

**4. Sidebar / breadcrumbs**
- Novo item em Configurações → "Rede das lojas" com ícone `Router`. Atualizar `PAGE_TITLES` em `AppLayout.tsx`.

### Script Mikrotik que a página vai gerar (referência)

```text
/tool netwatch
add host=8.8.8.8 interval=15s timeout=2s \
  up-script=":do {/tool fetch url=\"https://<edge>/mikrotik-wan-alert\" \
     http-method=post http-header-field=\"Content-Type:application/json\" \
     http-data=\"{\\\"token\\\":\\\"<TOKEN_LOJA>\\\",\\\"event\\\":\\\"wan_up\\\"}\" \
     keep-result=no} on-error={}" \
  down-script=":do {/tool fetch url=\"https://<edge>/mikrotik-wan-alert\" \
     http-method=post http-header-field=\"Content-Type:application/json\" \
     http-data=\"{\\\"token\\\":\\\"<TOKEN_LOJA>\\\",\\\"event\\\":\\\"wan_down\\\"}\" \
     keep-result=no} on-error={}"

/system scheduler
add name=nexa-heartbeat interval=2m on-event=":do {/tool fetch \
   url=\"https://<edge>/mikrotik-wan-alert\" http-method=post \
   http-header-field=\"Content-Type:application/json\" \
   http-data=\"{\\\"token\\\":\\\"<TOKEN>\\\",\\\"event\\\":\\\"heartbeat\\\"}\" \
   keep-result=no} on-error={}"
```

Se você quiser depois, dá pra evoluir: rodar netwatch também no link 4G (avisa se o backup também caiu), enviar o IP público atual no payload pra detectar a troca automática, e criar SLA de disponibilidade por loja.

### Detalhes técnicos

- Debounce de 60s no `mikrotik-wan-alert` pra evitar spam em flap.
- Heartbeat de 2min + tolerância de 6min = 3 tentativas perdidas antes de considerar offline.
- Token por device é UUID gerado no cadastro; regenerável na UI (invalida script antigo).
- WhatsApp usa o canal Z-API já configurado (mesma infra dos alertas de RH).
- Nenhuma alteração em RH/Financeiro/PDV/iFood.

### Fora do escopo (posso fazer depois se quiser)
- SNMP / gráficos de tráfego por interface.
- Auto-configuração remota do Mikrotik (exigiria API/VPN).
- Monitorar a saúde do próprio link 4G com netwatch separado.
