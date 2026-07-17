## O que está acontecendo

A duplicidade é no **chat do site**, não no WhatsApp.

Eu encontrei o padrão no banco: a mesma resposta da Giana aparece duas vezes com IDs diferentes, por exemplo:

- `assistant_...` gerado pelo backend/IA
- `a_...` gerado pelo widget do navegador

Ou seja: não são duas respostas diferentes da IA. É a **mesma resposta sendo salva duas vezes** com identidades diferentes.

## Por que isso acontece

O fluxo atual tem duas fontes tentando representar a resposta da Giana:

1. O **ChatWidget** cria uma mensagem temporária da assistente no navegador para mostrar o streaming em tempo real.
2. A função `parme-chat` também recebe o resultado final da IA e grava a resposta com outro ID.
3. Na próxima mensagem do cliente, o navegador reenvia o histórico local, incluindo a resposta temporária anterior.
4. O backend já tinha a mesma resposta salva com outro ID, então a conversa fica com duas versões da mesma mensagem.

A correção anterior tentou deduplicar por conteúdo, mas ficou incompleta porque:

- algumas conversas já ficaram “contaminadas” com duplicatas antigas;
- o backend ainda aceita mensagens `assistant` vindas do navegador como se fossem fonte confiável;
- a gravação acontece em dois momentos: antes do streaming e ao finalizar o streaming.

Por isso está difícil: não é só “bloquear clique duplo”. É um problema de **sincronização entre estado local do navegador, streaming da IA e persistência no banco**.

## Plano de correção

1. **Definir o backend como fonte única das respostas da Giana**
   - O navegador pode mostrar a resposta temporária, mas o backend não deve salvar essa versão local como uma nova resposta definitiva.

2. **Ajustar `parme-chat` para ignorar duplicatas de assistant vindas do cliente**
   - Ao receber o histórico do navegador, manter as mensagens do usuário.
   - Para mensagens da Giana, preferir as que já estão gravadas pelo backend.
   - Se o conteúdo for igual, manter uma só.

3. **Deduplicar sempre antes de salvar**
   - Aplicar uma normalização final em `chat_conversations.messages` usando `role + conteúdo normalizado`.
   - Isso deve rodar tanto no salvamento inicial quanto no `onFinish` do streaming.

4. **Limpar conversas antigas já duplicadas**
   - Rodar uma atualização nos registros existentes para remover mensagens repetidas já gravadas.

5. **Proteger o widget contra envio duplo rápido**
   - Adicionar uma trava síncrona com `useRef`, além do `busy`, para impedir dois submits antes do React atualizar o estado.

6. **Garantir que o histórico carregado não mostre duplicatas**
   - Ajustar a função que retorna mensagens da conversa para também devolver a lista deduplicada.

7. **Publicar as funções afetadas**
   - Deploy de `parme-chat` e, se necessário, `parme-get-conversation-messages`.

## Resultado esperado

A Giana deve continuar respondendo em streaming normalmente, mas cada resposta aparecerá e ficará salva **uma única vez**, mesmo após nova mensagem, reload ou leitura do histórico.