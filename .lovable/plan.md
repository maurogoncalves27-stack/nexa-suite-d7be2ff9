## Objetivo
Corrigir o fluxo do CRM/Giana para:
- Mostrar toda conversa com mais de uma mensagem do cliente.
- Não depender mais de endpoints/conectores antigos do Parmê para conversa, ticket e reserva.
- Garantir que reclamações virem tickets reais no banco.
- Garantir que reservas feitas pelo chat/formulário sejam registradas localmente.

## Achados principais
- O CRM já lê as tabelas locais `chat_conversations`, `support_tickets` e `reservations`, mas ainda tem textos e estados legados dizendo “Parmê ainda não expõe endpoint”.
- A tabela `chat_conversations` guarda as mensagens localmente; não precisa mais buscar conversa em API externa.
- O filtro atual da aba Conversas usa `m.role === "user"`; vou deixá-lo mais robusto para contar qualquer entrada de cliente que não seja `assistant`, `ai`, `bot` ou `system`.
- O teste `teste1` está salvo com 6 mensagens do cliente, mas não existe nenhum ticket em `support_tickets`.
- A causa mais forte para ticket não abrir: o prompt customizado salvo no banco sobrescreve o prompt corrigido do código e ainda orienta a IA a “explicar iFood” antes de registrar; além disso, hoje o registro depende da IA chamar a ferramenta corretamente.

## Plano de implementação
1. **CRM sem conectores antigos**
   - Remover mensagens/fluxos de erro sobre endpoints públicos antigos do Parmê.
   - Trocar textos como “buscando mensagens no Parmê” por “carregando conversa local”.
   - Usar somente as mensagens salvas em `chat_conversations.messages` para abrir conversa e relacionar tickets.
   - Ajustar botões de reserva para dizer que confirmam/excluem no sistema local.

2. **Filtro correto de conversas**
   - Criar uma função única para identificar mensagem do cliente.
   - Mostrar conversas quando houver `> 1` entrada do cliente.
   - Esconder apenas conversas com 0 ou 1 entrada do cliente, como “oi” e nada mais.
   - Usar a mesma contagem na lista, no modal e no dashboard.

3. **Ticket garantido por lógica determinística**
   - No `parme-chat`, manter a ferramenta `registrar_problema_pedido`, mas adicionar uma rotina de segurança no final do atendimento: se as mensagens do cliente indicarem reclamação/problema de pedido e ainda não houver ticket relacionado, criar o ticket automaticamente.
   - Detectar reclamações por termos como item faltando, errado, frio, atraso, cobrança, “não veio”, “veio faltando”, “pedido”, “iFood”, etc.
   - Extrair quando possível: nome, telefone, número do pedido e descrição a partir da conversa.
   - Evitar duplicidade por sessão/contato/pedido/mensagem recente.

4. **Reserva mais confiável**
   - Manter a ferramenta `criar_reserva`, mas também revisar validações para aceitar horário/data que a IA converta.
   - Garantir log claro quando a criação falhar.
   - Confirmar que formulário público e chat gravam na mesma tabela `reservations`.

5. **Prompt customizado do agente**
   - Atualizar a lógica para que regras críticas do sistema tenham prioridade mesmo quando existe prompt customizado no banco.
   - Acrescentar regras não sobrescrevíveis: se há problema de pedido, registrar ticket; nunca dizer que registrou sem sucesso; se a ferramenta falhar, avisar que não conseguiu.
   - Opcionalmente atualizar o valor salvo atual em `parme_site_settings.agent` para remover instruções antigas conflitantes.

6. **Validação pós-refatoração**
   - Testar via função de chat uma reclamação com nome, pedido de 3 dígitos e telefone.
   - Verificar que `support_tickets` recebe o ticket.
   - Verificar que `chat_conversations` recebe a conversa com mais de uma entrada do cliente.
   - Verificar no CRM que a conversa aparece e abre com as mensagens locais.

## Arquivos/tabelas envolvidos
- `src/pages/CRM.tsx`
- `supabase/functions/parme-chat/index.ts`
- Possível ajuste de dados em `parme_site_settings` para o prompt atual
- Tabelas: `chat_conversations`, `support_tickets`, `reservations`