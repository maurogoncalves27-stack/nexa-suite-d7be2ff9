
## Objetivo
Toda interação com a Giana entra na aba **Conversas** do CRM como registro independente, mesmo quando vira ticket ou reserva. Conversas curtas (uma frase só) aparecem listadas, mas em formato compacto. Nome e o máximo de dados do cliente são extraídos automaticamente.

## Problema atual
- `chat_conversations.client_meta` está `null` em todas as linhas → nome do cliente nunca é mostrado mesmo quando ele responde "teste1" / "mauro".
- O extrator atual só salva `name` se `inferClientName()` casar em uma de 4 regex e se `client_meta` ainda não tiver nome. Não extrai telefone, bairro, marca, intenção etc.
- A aba Conversas hoje já mostra a conversa independente, mas há risco de o filtro `isRelevantConversation` esconder mensagens curtas. Precisa garantir que toda conversa com ≥1 mensagem do cliente aparece, e que ter ticket/reserva vinculado não remove a conversa da listagem (só adiciona badge).

## Mudanças

### 1. Edge function `supabase/functions/parme-chat/index.ts`
Reescrever extração de metadados para rodar em todo turno (pré-stream e `onFinish`) e popular `client_meta` com tudo que conseguir inferir:

- **`name`** — manter `inferClientName` atual + cobrir mais padrões:
  - resposta direta após pergunta "como posso te chamar/qual seu nome" (já existe)
  - primeira mensagem curta (1-2 tokens não-triviais) quando o assistant pediu o nome
  - "pode me chamar de X", "sou o X", "aqui é a X"
- **`phone`** — primeiro match de `(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}` nas mensagens do cliente, normalizado para dígitos.
- **`neighborhood`** — bairro detectado quando o cliente responde à pergunta "em qual bairro/região você está?" (próxima msg do user após essa pergunta do assistant) OU via lista de keywords (asa norte, sudoeste, lago sul, etc.) já usada no `sugerir_ifood`.
- **`brand_interest`** — "parme" / "estrogonofe" / "box caipira" mencionados nas msgs do cliente.
- **`intent`** — heurística simples por keywords: `reserva`, `delivery`, `reclamacao`, `duvida_cardapio`, `outro`.
- **`first_message_at`** / **`last_message_at`** (informativo).
- `mergeClientMeta` passa a fazer merge campo-a-campo (não sobrescreve se já existir, mas adiciona o que estiver faltando).

### 2. `src/pages/CRM.tsx` — aba Conversas independente

- Remover qualquer caminho em que a conversa "vira ticket" e some da listagem. Hoje `baseConvs` (de `chat_conversations`) é mantido sempre e ganha `related_tickets`. Confirmar e proteger: NÃO filtrar conversa por ter ticket vinculado.
- `isRelevantConversation`: já está em `clientMsgs.length >= 1`. Manter assim — conversas de uma frase aparecem.
- Listagem: para conversas com apenas 1 mensagem do cliente, renderizar em "modo compacto" (uma linha: prévia da frase + nome se houver + hora), sem CTA de "ver completo". As demais continuam expandindo o histórico completo no modal atual.
- Badges no card da conversa: mostrar 🎫 quando `related_tickets.length > 0` e 📅 quando `pickClientName`/telefone bater com alguma reserva (matching já existe via telefone). Conversa permanece no topo independente disso.
- Coluna/Subtítulo "Nome": usar `pickClientName(c)` (já lê `client_meta.name`); agora populado pela edge function, o nome "teste1"/"mauro" aparece.

### 3. Sem migrations
`client_meta` já é `jsonb` e a coluna já existe. Nada de schema novo.

## Detalhes técnicos
- Edge function: adicionar função `enrichClientMeta(flat, current, fallback)` que retorna o objeto com todas as chaves acima e substituir as duas chamadas de `mergeClientMeta` (pré-stream e `onFinish`).
- CRM.tsx: ajustar somente render dos cards de conversa para o "modo compacto" quando `clientMsgs.length === 1`; não mexer no fluxo de carregamento (`load`) além de garantir que `baseConvs` sempre entra em `mappedConvs`.
- Não tocar em `reservations`, `support_tickets`, tools da Giana, nem na UI do widget `ChatWidget.tsx`.

## Validação
1. Abrir o chat, responder "teste1" quando perguntar nome → recarregar `/crm` → conversa aparece com `Nome: Teste1`.
2. Mandar só "oi" e fechar → conversa aparece em modo compacto na lista.
3. Reclamar de pedido e dar telefone → vira ticket E continua listada na aba Conversas com badge 🎫.
4. Fazer reserva pelo chat → conversa continua na aba Conversas com badge 📅 + reserva visível na aba Reservas.
