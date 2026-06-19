# Escopo do compromisso por voz: perguntar no diálogo

## Problema

Hoje, todo compromisso criado pelo botão flutuante de voz é salvo com `scope: "all"`. O cron `process-appointment-reminders` então cria um aviso urgente + push + WhatsApp para **todos os colaboradores ativos da empresa**. Não é o comportamento desejado para a maioria dos compromissos pessoais ("dentista amanhã 10h", "reunião com fornecedor").

## Solução

Adicionar um seletor de escopo dentro do `<Dialog>` de confirmação em `src/components/announcements/VoiceAppointmentFAB.tsx`, com **"Somente eu"** como padrão. O usuário pode alterar antes de salvar.

### Opções do seletor

- **Somente eu** (default) — `scope='employee'`, `employee_id` = meu próprio cadastro (resolvido via `employees.user_id = auth.uid()`).
- **Uma loja** — `scope='store'` + dropdown de lojas físicas (`stores.is_virtual = false`).
- **Um colaborador** — `scope='employee'` + busca de colaborador ativo.
- **Todos os colaboradores** — `scope='all'` (comportamento atual, mas agora explícito).

### UX

- Bloco novo no topo do diálogo, acima do campo "Título":
  - Label: "Quem recebe o lembrete?"
  - `Select` com as 4 opções acima.
  - Quando "Uma loja" → mostra `Select` de lojas logo abaixo.
  - Quando "Um colaborador" → mostra `Combobox` de colaboradores (reaproveitar padrão já usado em outros lugares; se não houver, usar um `Select` simples com busca por nome).
- Se o usuário escolher "Somente eu" mas o `auth.uid()` não tiver um `employees.user_id` correspondente → mostrar toast amigável ("Seu usuário não está vinculado a um colaborador") e bloquear o salvar até trocar o escopo.
- O resumo lido em voz alta (`speak(...)`) ganha sufixo: "… Lembrete só para você" / "… para a loja Asa Sul" / "… para Fulano" / "… para todos".

### Mudança no `save()`

Montar o payload de `appointments.insert` de acordo com o escopo selecionado:

```ts
const base = { title, description, location, meeting_url, start_at, end_at,
               reminder_offsets_min: [60, 1440], status: "scheduled" };
let extra;
if (scope === "self")     extra = { scope: "employee", employee_id: myEmployeeId };
if (scope === "employee") extra = { scope: "employee", employee_id: selectedEmployeeId };
if (scope === "store")    extra = { scope: "store",    store_id: selectedStoreId };
if (scope === "all")      extra = { scope: "all" };
```

### Dados a carregar

Ao abrir o diálogo (uma vez):
- `myEmployeeId`: `select id from employees where user_id = auth.uid() limit 1`.
- Lojas físicas: `select id, name from stores where is_virtual = false order by name`.
- Colaboradores ativos: `select id, full_name from employees where status='active' order by full_name` (lazy — só quando escolher "Um colaborador").

## Fora de escopo

- Não mexer no cron `process-appointment-reminders` — a lógica de `scope` já resolve corretamente os três casos.
- Não mexer no parser de voz (`parse-appointment-voice`) — o escopo é decisão humana no diálogo, não inferência da IA.
- Não alterar `AppointmentsManagerPanel` nem outras telas de agenda.

## Arquivos afetados

- `src/components/announcements/VoiceAppointmentFAB.tsx` (único arquivo)
