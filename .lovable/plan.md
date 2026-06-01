## Objetivo

Acabar com a duplicidade de cargo no sistema. Hoje convivem:
- `employees.position` — texto livre (ex: "SUPERVISOR DE LOJA", "Supervisor de Loja", "ATENDENTE")
- `employees.cbo_code` / `cbo_title` — CBO oficial
- Tabela `positions` — cargos internos já mapeados a CBO

Resultado disso: Janaina aparece como "SUPERVISOR ADMINISTRATIVO" (porque foi digitado livre na ficha), enquanto o cargo dela em /cargos é "Supervisor de Loja". Bonificações, regras automáticas e relatórios quebram porque dependem do texto.

A partir de agora vai existir **uma única fonte**: a tabela `positions`. Todo colaborador precisa ter um `position_id` escolhido de lá. O `cbo_code` e `cbo_title` vêm automaticamente do cargo escolhido. Não existe mais "cargo livre".

---

## O que muda na prática

### 1. Cadastro do colaborador (`EmployeeForm`)
- Combobox de cargo passa a ser **lista fechada** dos cargos ativos em `/cargos` (sem opção "usar como cargo livre", sem busca direta na tabela CBO).
- Ao escolher um cargo, o sistema preenche `position` (nome do cargo interno), `cbo_code` e `cbo_title` automaticamente — esses três campos passam a ser sempre coerentes.
- Se o cargo desejado não existe, o RH precisa cadastrar primeiro em `/cargos` (escolhendo o CBO lá).

### 2. Página `/cargos`
- Continua sendo o único lugar para criar/editar cargos.
- CBO passa a ser **obrigatório** ao criar/editar um cargo (hoje é opcional — Trainee, Estagiário e Freelancer estão sem CBO; vamos ter que escolher o CBO certo pra esses três antes de fechar).

### 3. Bonificações, regras automáticas, ranking, ficha técnica, etc.
- Tudo que hoje faz `WHERE employees.position = 'SUPERVISOR DE LOJA'` continua funcionando, porque o `position` vai estar normalizado (sempre igual ao `name` do cargo da lista). Não é preciso reescrever as features — só garantir que os dados batam.
- `position_bonuses.position` e `position_responsibilities.position` continuam casando por texto, mas agora o texto vem 100% da tabela `positions`.

### 4. Normalização dos colaboradores existentes (one-shot)
Hoje temos divergências reais:
- 1 colaborador com `position = "Supervisor de Loja"` (capitalizado) + 8 com `SUPERVISOR DE LOJA` (maiúsculas) → unificar para o `name` exato da tabela `positions` ("Supervisor de Loja").
- Janaina (1 reg.) com `position = "SUPERVISOR ADMINISTRATIVO"` → revisar manualmente: virou Supervisor de Loja ou Encarregado de Escritório?
- 1 colaborador "AUXILIAR DE PRODUÇÃO" com CBO `Operador de empilhadeira` (errado, herdado da tabela) → revisar.
- "Estagiário"/"ESTAGIÁRIO" duplicado → unificar.
- "AUXILIAR ADMINISTRATIVO" no `employees` vs "Auxiliar administrativo" no `positions` → unificar nome.

Vou listar todos os colaboradores fora do padrão num relatório SQL antes de migrar e te peço para confirmar caso a caso os ambíguos (Janaina, auxiliar de produção, etc.).

### 5. Integridade futura
- Adicionar coluna `position_id uuid REFERENCES positions(id)` em `employees`, populada a partir do `position` atual via match exato (case-insensitive).
- Trigger que, ao salvar `employees`, **bloqueia** se `position_id` for nulo OU se o `position`/`cbo_code`/`cbo_title` não baterem com o cargo referenciado — impedindo divergência futura.
- Trigger no `positions` que, ao renomear um cargo, propaga o novo nome para `employees.position` e tabelas dependentes (`position_bonuses.position`, `position_responsibilities.position`).

---

## Passos de execução

1. **Levantar relatório** dos colaboradores com `position` divergente do `positions.name` e confirmar com você os ambíguos.
2. **Migration** adicionando `employees.position_id` + trigger de integridade + trigger de propagação de rename.
3. **Atualizar `/cargos`** para tornar CBO obrigatório; cadastrar CBO faltante em Trainee/Estagiário/Freelancer (te pergunto os códigos).
4. **Atualizar `PositionCboCombobox`** (ou substituir por um novo `PositionSelect`) usado em `EmployeeForm` para ser lista fechada vinda só de `positions`.
5. **Rodar UPDATE** normalizando `employees.position`, `cbo_code`, `cbo_title` e preenchendo `position_id`.
6. **Validar**: rodar de novo a query que mostra divergências (deve voltar zero), abrir `/bonificacoes` e conferir que Janaina e os outros supervisores aparecem corretos.

---

## Pontos técnicos

- Tabelas afetadas: `employees` (novo `position_id` + triggers), `positions` (CBO obrigatório).
- Lugares no código que vão mudar: `EmployeeForm.tsx`, `PositionCboCombobox.tsx` (ou novo componente), `Positions` (página /cargos).
- Lugares que **não mudam**: bonificações, regras automáticas, holerite, contrato, eSocial S-2200 — todos continuam lendo `position`/`cbo_code`/`cbo_title` como hoje, só que agora garantidamente coerentes.

---

## O que preciso confirmar antes de implementar

Vou rodar o relatório das divergências e te trazer a lista para você decidir:
- Para qual cargo da lista cada colaborador "fora do padrão" deve apontar (principalmente Janaina e o "auxiliar de produção" com CBO de empilhadeira).
- Qual CBO usar para Trainee, Estagiário e Freelancer (ou se eles ficam como exceção isenta — nesse caso, CBO obrigatório só para CLT).
