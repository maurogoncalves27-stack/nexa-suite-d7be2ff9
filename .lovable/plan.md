## Diagnóstico

O widget `ChatWidget.tsx` cria a resposta da Giana com id de placeholder `a_<timestamp>` e a reenvia no turno seguinte. O `onFinish` do servidor já grava a mesma resposta com id `assistant_N_<prefixo>`. Resultado: cada fala da Giana aparece duas vezes em `chat_conversations.messages`.

A função `mergeFlatMessages` em `supabase/functions/parme-chat/index.ts` já tem dedup por id **e** por (role+conteúdo) desde 23/06, mas o edge function não foi redeployado depois disso — por isso a versão antiga continua duplicando em produção.

## O que vou fazer

1. **Forçar redeploy do `parme-chat`** — alterar o comentário do topo do arquivo para gerar uma nova versão do edge function (a versão com dedup passa a rodar).
2. **Limpar conversas já duplicadas** em `chat_conversations`: para cada linha, dedupar `messages` por `(role, content)` mantendo o registro mais antigo (por `ts`, preservando ordem original). Atualiza `message_count` junto. Linhas sem duplicata não são tocadas.

Nenhum schema novo, nenhuma tela alterada — só o edge function e limpeza de dados.