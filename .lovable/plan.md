
# Revisão das conversas da Giana — falhas encontradas e plano de correção

Base: 56 conversas (20/06 a 24/07), `supabase/functions/parme-chat/index.ts`, tabelas `support_tickets` (6 linhas, **todas com status `open`**) e `reservations` (**0 linhas**).

## Falhas confirmadas

### 1. Gate do nome bloqueia a resposta (maior perda de conversão)
O prompt (linhas 46-47) manda perguntar o nome e "só depois" tratar a dúvida. Efeito observado:
- Yara pediu preço 3x seguidas e a Giana repetiu "me diz seu nome" antes de responder ("Ih, quase esqueci de perguntar seu nome de novo!").
- "Não consegui enviar o currículo" → resposta foi só "assim que você me disser seu nome eu verifico". Cliente sumiu.
- Fernanda pediu link 2x e só recebeu depois de dar o nome.
- Dezenas de conversas morrem em 2 mensagens ("oi" → "Como posso te chamar?" → fim).

### 2. Reservas não são gravadas
`reservations` está **vazia**, mas há conversas de reserva (Nelson, entre outras) onde a Giana coleta/encaminha dados. Ou o tool `criar_reserva` nunca é chamado, ou o insert falha em silêncio (o erro só vai para `console.error`, e a IA às vezes responde "a equipe confirma por telefone" sem tool). Cliente acredita que reservou e não reservou.

### 3. Tickets com dados sujos e sem ciclo de vida
- `order_number` errado: nos tickets da Nadia gravou **99866** (pedaço do telefone) em vez do pedido **7207**.
- `title` nulo em 4 dos 6 tickets.
- `description` é um despejo cru das mensagens do cliente, não um resumo.
- Todos os 6 tickets seguem `open` — não há fila, responsável, prazo nem retorno ao cliente. A Nadia (caso mais grave, cliente fidelizada perdida) nunca recebeu retorno.

### 4. Preço: ora recusa, ora responde
Mesma pergunta gera respostas diferentes: "confira no iFood", "entre R$ 35 e R$ 60", "R$ 39,90 em Águas Claras". A faixa "R$ 35 a 60" é estimativa — exatamente o que a regra anti-alucinação proíbe.

### 5. Retirada/balcão com informação divergente
Em uma conversa: "pode pedir direto no balcão"; em outra: "pedidos exclusivamente pelo iFood, não temos telefone". Fernanda ficou sem saber se retira pagando taxa ou não.

### 6. Promessas sem dono
"Vou confirmar com a equipe e te retorno" é dito sem abrir ticket e sem canal de retorno (chat web anônimo). Vira promessa vazia.

### 7. Vagas
Não há nenhuma referência a `https://nexasuite.aquelaparme.com.br/vagas` na `parme-chat` — a regra de vagas só existe no fluxo de WhatsApp.

### 8. Pedido de WhatsApp no fim ("me passa seu WhatsApp? Prometo não te incomodar")
Coleta sem finalidade declarada nem opt-in — risco LGPD e tom que destoa.

## Plano de correção

**A. Responder primeiro, perguntar o nome depois**
- Reescrever as regras 46-47: responder imediatamente a qualquer pergunta objetiva; pedir o nome no máximo **uma vez**, junto da resposta, nunca como pré-requisito.
- Proibir repetir o pedido de nome. Se o cliente ignorar duas vezes, seguir sem nome.
- Manter a exigência de telefone só onde é funcional: abrir ticket e criar reserva.

**B. Consertar reservas**
- Tornar `criar_reserva` obrigatório antes de qualquer frase de confirmação; a Giana não pode dizer "reserva registrada/a equipe confirma" sem `sucesso: true`.
- Em caso de erro do insert, responder honestamente ("não consegui registrar agora, vou passar pra equipe") e abrir ticket de reserva.
- Validar dia/horário contra o funcionamento do salão da Asa Norte e recusar data passada.
- Verificar por que a tabela está zerada (logs da função + teste ponta a ponta criando uma reserva real).

**C. Qualidade dos tickets**
- Nunca deduzir `numero_pedido` de dígitos do telefone: aceitar só número informado explicitamente como pedido (4-8 dígitos, distinto do contato).
- `titulo` obrigatório e `descricao` como resumo estruturado (o que houve, item, pedido, o que o cliente quer), com o transcript anexado à parte.
- Adicionar tratativa: campos de status/responsável/prazo já existentes ganham fila visível no CRM e alerta de ticket aberto > 2h.
- Devolver ao cliente um número de protocolo curto.

**D. Preço e retirada: uma única fonte**
- Bloquear no prompt qualquer faixa/estimativa de preço; sem dado da tool, responder só com o link do iFood.
- Padronizar a resposta de retirada (uma regra única: como pede, se paga taxa, endereço) na FAQ oficial usada por `consultar_info`.

**E. Vagas e WhatsApp**
- Adicionar ao prompt da `parme-chat`: pergunta sobre vaga/currículo/trabalhar → responder com `https://nexasuite.aquelaparme.com.br/vagas`.
- Remover o pedido espontâneo de WhatsApp no encerramento; só pedir contato quando houver ticket ou reserva, explicando o motivo.

## Detalhes técnicos
Arquivos envolvidos: `supabase/functions/parme-chat/index.ts` (SYSTEM prompt, `criar_reserva`, `registrar_problema_pedido`, sanitização de `numero_pedido`), FAQ/knowledge da Giana, e a tela de CRM para a fila de tickets. Nenhuma alteração de schema é necessária além de possíveis colunas de tratativa em `support_tickets`, a confirmar após o teste de reserva.
