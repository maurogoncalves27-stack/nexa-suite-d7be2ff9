## Objetivo
Deixar a aba Conversas do CRM capaz de **filtrar conversas onde há problema detectável** (reclamação, atraso, item errado/faltando, cobrança, qualidade, etc.), sem esperar o cliente falar com um humano.

Hoje já existe alguma detecção espalhada, mas nada consolidado no CRM:
- `parme-chat` (Giana) tem tool `registrar_problema_pedido` que cria ticket — funciona só quando a IA em runtime decide chamar.
- `whatsapp-customer-ai-reply` tem `register_complaint` (canal separado).
- `CRM.tsx` linha 344 tem só um regex simples ("reclama|ruim|frio|atrasou…") gerando um campo "Tom".
- Não há classificação persistida por conversa, nem filtro/badge/KPI de "problema".

## Arquitetura proposta (2 camadas)

**Camada 1 — Heurística rápida (síncrona, no client + no edge):**
Regex + palavras-chave por categoria (reclamacao, atraso, item_faltando, item_errado, qualidade, cobranca, reembolso, elogio, duvida). Roda em toda conversa, muito barato. Já dá um `has_issue` e uma `category` provisórios.

**Camada 2 — Classificação com IA (assíncrona, no servidor):**
Só rodada quando (a) a heurística acusou indício ou (b) a conversa tem ≥3 mensagens do cliente e ainda não foi triada. Usa **Lovable AI Gateway** (`google/gemini-2.5-flash` — barato e bom em PT-BR) com prompt curto retornando JSON estruturado:
```json
{
  "has_issue": true,
  "severity": "high",           // none | low | medium | high | critical
  "category": "atraso",         // enum fechado
  "summary": "Pedido #4821 atrasou 40min e chegou frio.",
  "keywords": ["atraso","frio"],
  "customer_sentiment": "frustrated",
  "needs_human": true
}
```

Resultado gravado em nova coluna `chat_conversations.triage jsonb` (+ `triaged_at timestamptz`). Isso torna o filtro/ordenação triviais no client — nada de reprocessar mensagens toda hora.

## Mudanças

### Backend
1. **Migration**: adicionar em `chat_conversations`:
   - `triage jsonb` (nullable)
   - `triaged_at timestamptz` (nullable)
   - índice parcial `WHERE triage->>'has_issue' = 'true'` para queries de "problemas".

2. **Edge function `triage-conversation`** (nova):
   - Input: `{ conversation_id }` ou `{ batch: true, limit: 20 }`.
   - Fluxo por conversa: carrega mensagens do cliente → passa heurística → se `has_issue` OU `msgs.length ≥ 3` chama Lovable AI → merge resultado → `update chat_conversations set triage=..., triaged_at=now()`.
   - Idempotente: só reprocessa se `last_message_at > triaged_at` ou `triage IS NULL`.

3. **Cron** (5 min): `select supabase.functions.invoke('triage-conversation', { body: { batch: true, limit: 30 } })`. Fila natural — nunca trava a IA principal.

4. **Botão "Reanalisar"** no dialog da conversa → dispara triage sob demanda.

### Frontend (`src/pages/CRM.tsx` — aba Conversas, só visual/UX)
1. **KPIs adicionais**: "Com problema", "Críticos", "Sem ticket" (usando `triage->>severity`).
2. **Filtros pill no topo da lista**: `[Todos] [Problemas] [Críticos] [Sem resposta] [Elogios]` + Select de categoria.
3. **Badge de severidade** na linha (cores dos tokens: destructive/warning/success/muted). Ícone `AlertTriangle` para high/critical.
4. **Coluna "Assunto"** substitui a "Prévia" quando `triage.summary` existe (mais útil que os primeiros 80 chars).
5. **Ordenação padrão**: severidade desc, depois `last_message_at` desc — problemas críticos primeiro.
6. **Ação inline "Abrir ticket"** quando `triage.has_issue && related_tickets.length === 0` → cria `support_tickets` já preenchido com summary/categoria/telefone extraído.

## Fluxo completo (ciclo detecção → resolução)
1. Cliente conversa via Giana/WhatsApp → mensagens gravadas em `chat_conversations`.
2. Cron `triage-conversation` marca `triage`.
3. CRM mostra badge/filtro; equipe vê "Problemas" no topo.
4. Se já virou ticket via `registrar_problema_pedido`, `related_tickets` liga os dois; ticket resolvido → conversa some do filtro "Aguardando".
5. Se não virou ticket, botão "Abrir ticket" no CRM cria.

## Detalhes técnicos
- Modelo IA: `google/gemini-2.5-flash` via `LOVABLE_API_KEY` (grátis até 06/10/2026, sem custo neste período).
- JSON schema forçado via `response_format: { type: 'json_schema', ...}` para não ter parsing frágil.
- Rate: batch de 20‑30 por rodada, timeout 15s, retry único.
- Custo esperado: <200 tokens in / 100 tokens out por conversa; ~R$0 no período grátis.
- Sem mudança em `parme-chat` / `whatsapp-customer-ai-reply` — a triage é **complementar** e classifica todo o histórico, inclusive as conversas onde a IA não chamou o tool.

## Fora de escopo
- Não reescrever a Giana nem mexer em `parme-chat`.
- Não criar respostas automáticas ao cliente na triage.
- Não mudar schema de `support_tickets`.

## Arquivos afetados
- `supabase/migrations/…_add_triage_to_conversations.sql` (novo)
- `supabase/functions/triage-conversation/index.ts` (novo)
- `supabase/functions/_shared/triage-heuristic.ts` (novo — regex/keywords compartilhados)
- Cron via `supabase/migrations` (`select cron.schedule(...)` a cada 5 min)
- `src/pages/CRM.tsx` — KPIs de conversas, filtros pill, coluna Assunto, badge, botão "Abrir ticket"
- `src/integrations/supabase/types.ts` — auto-gerado após migration
