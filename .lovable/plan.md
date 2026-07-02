# Análise semanal da Giana + CSAT via emoji

Objetivo: gerar automaticamente, toda semana, um diagnóstico da performance da Giana no WhatsApp com sugestões acionáveis, combinando análise por IA das conversas + avaliação do cliente via emoji.

## 1. CSAT do cliente (emoji)

Ao encerrar conversa (sem msg do cliente por 30 min, ou Giana marca resolvida), a Giana envia:

```
Como foi seu atendimento? 👍 ou 👎
(pode escrever um comentário se quiser)
```

Nova tabela `giana_feedback`:
- `conversation_id`, `phone`, `store_id`, `brand_id`
- `rating` (`positive` | `negative` | null se só texto)
- `comment` (text)
- `sentiment` (pos/neu/neg — IA classifica quando só vier texto)
- `asked_at`, `answered_at`

Regras:
- 1x por conversa (flag `feedback_requested_at` em `chat_conversations`).
- Não pede se conversa foi escalada pra humano.
- Cliente pode responder 👍/👎, "bom"/"ruim", ou texto livre — edge function interpreta.

## 2. Relatório semanal automático (segunda 08:00 BRT)

Nova edge function `giana-weekly-review` chamada por cron `pg_cron` + `pg_net`:

1. Coleta conversas dos últimos 7 dias com ≥ 3 mensagens do cliente.
2. Junta com `triage` existente + `giana_feedback` da semana.
3. Amostra pra análise detalhada por IA:
   - 100% das conversas com `rating = negative` ou `triage.severity in (high, critical)`.
   - 20% aleatório das demais (cap 50/semana pra controlar custo).
4. Chama `google/gemini-3-flash-preview` via AI SDK + Lovable AI Gateway, retornando JSON estruturado:
   - `problemas_recorrentes[]` (categoria + exemplos + frequência)
   - `respostas_ruins[]` (trechos onde a Giana errou / foi genérica / inventou)
   - `oportunidades_de_tool[]` (perguntas frequentes que deveriam virar tool ou base de conhecimento)
   - `sugestoes_prompt[]` (ajustes concretos no system prompt)
   - `elogios[]`
5. Salva em nova tabela `giana_weekly_reports` (`week_start`, `metrics jsonb`, `analysis jsonb`).

Métricas agregadas via SQL puro:
- Total de conversas, clientes únicos, msgs/conversa
- CSAT (👍 / total respondidos), taxa de resposta ao feedback
- % com `triage.has_issue`, % críticas, % escaladas pra humano
- Tempo médio 1ª resposta, duração média
- Top 10 categorias de problema

## 3. Painel no CRM (aba Agente IA)

Reformula a aba atual (`src/pages/CRM.tsx`):
- **Cards de topo**: CSAT semana, Δ vs semana anterior, conversas analisadas, % com problema.
- **Gráfico**: CSAT diário últimos 30d + volume de conversas.
- **Lista "Relatórios semanais"**: expande e mostra `analysis` renderizado — problemas recorrentes, sugestões de prompt, oportunidades de tool, exemplos clicáveis que abrem a conversa.
- **Ranking "Piores conversas da semana"** (👎 + severidade alta) → clique abre a conversa.
- **Botão "Rodar análise agora"** (admin) → dispara a edge function ad-hoc.
- **Backlog de sugestões**: cada `sugestoes_prompt` vira card com diff proposto; admin aprova → grava nova versão em `whatsapp_customer_config.system_prompt` mantendo histórico em `prompt_history jsonb`.

## Escopo técnico

**Banco (migration)**
- `giana_feedback` (nova) + índices por `store_id`, `created_at`, `rating`, GRANTs.
- `giana_weekly_reports` (nova) + GRANTs.
- `chat_conversations`: `feedback_requested_at timestamptz`, `feedback_rating text`.
- `whatsapp_customer_config`: `prompt_history jsonb default '[]'`.

**Edge functions**
- `whatsapp-customer-ai-reply` (existente): adicionar detecção de "conversa encerrada" → enviar pergunta de feedback; interpretar resposta (👍/👎/texto) → gravar em `giana_feedback`.
- `giana-weekly-review` (nova): cron semanal + endpoint POST manual pro botão "Rodar agora".

**Cron**
- `select cron.schedule('giana-weekly-review','0 11 * * 1', $$ net.http_post(...) $$)` (segunda 08:00 BRT).

**Frontend**
- `src/pages/CRM.tsx` aba Agente IA: novos componentes `GianaMetrics`, `GianaCsatChart`, `GianaWeeklyReport`, `GianaWorstConversations`, `GianaPromptSuggestions`. Segue design tokens e padrão de cabeçalho.

**Fora de escopo**
- Aplicar sugestões automaticamente ao prompt (fica manual com aprovação).
- E-mail semanal (usuário confirmou: só painel).
- Integrar CSAT da Giana ao NPS geral da loja.
