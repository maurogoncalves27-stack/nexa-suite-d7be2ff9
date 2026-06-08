## Objetivo
Remover o campo manual "Responsável pela visita" em `/nutri-visita` e gravar automaticamente o nome do usuário logado (que está preenchendo).

## Mudanças

1. **`NutriVisitReportPanel.tsx`**
   - Ao montar, buscar `profiles.full_name` do `user.id` atual e guardar em estado (`currentUserName`).
   - Remover o `<Input>` "Nome da nutricionista" do formulário.
   - Em `saveReport`, gravar `visitor_name = currentUserName` (fallback para `user.email` se o profile não tiver nome).
   - Mostrar o nome em modo somente-leitura logo abaixo da data, ex.: "Responsável: Fulana de Tal", só pra dar feedback visual.
   - Bloquear o botão "Salvar" se não conseguir resolver um nome.

2. **Sem mudança de banco**
   - `nutri_visit_reports.visitor_name` continua existindo e sendo preenchido — só muda a fonte. Histórico antigo continua válido.

3. **Histórico (`/nutri-visita/historico`)**
   - Nenhuma alteração; segue exibindo `visitor_name` salvo no registro.

## Fora de escopo
- Não mexer no responsável da loja (esse continua digitado + assinatura).
- Não mudar RLS nem schema.
- Não alterar PDF/relatório.

Pode aplicar?