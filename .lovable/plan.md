# Flag "Ignorar na folha de pagamento"

## Por que essa abordagem

Marcar o Luiz Cesar como desligado resolveria hoje, mas para reativar depois seria preciso recriar `user_id` + `user_roles` manualmente (o desligamento revoga os acessos por design). Como ele é um usuário de teste que precisa continuar logando, o melhor é criar uma flag reutilizável que tira o colaborador da folha sem mexer no status nem nos acessos.

## O que vai mudar

### 1. Banco de dados
- Nova coluna `employees.exclude_from_payroll BOOLEAN NOT NULL DEFAULT false`.
- Marcar `Luiz Cesar` com `exclude_from_payroll = true` já na mesma migração.

### 2. Cadastro do colaborador (UI)
- Em `src/components/employees/...` (aba de dados do colaborador, seção administrativa), adicionar um switch "Ignorar na folha de pagamento" com texto explicativo: *"Use apenas para usuários de teste/desenvolvimento. O colaborador continua ativo e com acesso, mas não entra no cálculo da folha, VT nem exportações."*
- Visível apenas para admin/super-usuário.

### 3. Geração da folha
- Nos fluxos que montam a folha (`generate-payroll` / edge functions correspondentes e nos filtros de `src/components/payroll/*` e `src/pages/Payroll.tsx`), acrescentar `.eq('exclude_from_payroll', false)` na query de `employees`.
- Mesma exclusão em: VT (`/vale-transporte`), C6 export, eSocial S-1200, holerites, adiantamentos, bonificações — para não travar nada por causa de dados faltando.

### 4. Indicador visual
- No card do colaborador (lista `/colaboradores`), mostrar um badge discreto "Fora da folha" quando a flag estiver ativa, para não confundir o RH.

## Como reverter depois
Basta desmarcar o switch no cadastro; ele volta a entrar na folha no próximo fechamento. Nenhum acesso é perdido em nenhum momento.

## Fora de escopo
- Não altero regras de cálculo da folha.
- Não mexo em `status` / `user_roles` / `user_id`.
- Não altero o fluxo de desligamento existente.
