## Objetivo
Tornar visualmente claro que **responsável pela loja**, **assinatura** e **observações gerais** valem para a visita inteira, criando uma aba final "Finalizar" dedicada.

## Mudanças em `NutriVisitReportPanel.tsx`

1. **Nova aba "Finalizar"** acrescentada ao final do `TabsList`, depois de todas as seções do checklist:
   - Label curto: "Finalizar" com ícone `CheckCircle2`.
   - Badge mostrando total de NCs da visita inteira (somando todas as seções), para o usuário ver o resumo antes de assinar.

2. **Mover para dentro do novo `TabsContent value="finalizar"`**:
   - Campo "Observações gerais"
   - Campo "Nome do responsável pela loja"
   - Bloco de "Assinatura do responsável pela loja" + botão Limpar
   - Botão "Salvar registro de visita"
   - Pequeno resumo no topo: "X itens conformes · Y não conformes" para dar contexto.

3. **Estado**: nada muda — `storeResponsible`, `sigRef`, `generalNotes` continuam como state único do componente, só a renderização migra para a aba final. Confirma de uma vez que é por visita, não por aba.

4. **Validação ao salvar**: se faltar responsável/assinatura, manter os toasts atuais e dar `setActiveTab("finalizar")` para levar o usuário ao lugar certo.

5. **Mobile-first**: aba "Finalizar" entra no `flex-wrap` já existente; conteúdo mantém `space-y-*` padrão.

## Fora de escopo
- Não mexer no histórico, no gerenciador de itens, nem na lógica de save/RLS.
- Não alterar schema (campos do banco continuam iguais — já são únicos por visita).
