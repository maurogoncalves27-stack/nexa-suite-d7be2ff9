# Contas recorrentes (fixas + variáveis)

## Objetivo
Parar de duplicar lançamentos mensais como SAIPOS, VIVO, Condomínio, CAESB, Neo Energia e Internet. Cadastrar cada conta recorrente **uma única vez** e deixar o sistema gerar automaticamente o lançamento em `accounts_payable` a cada mês.

## Como vai funcionar (visão do usuário)

1. Nova página **Financeiro → Contas recorrentes** (`/financeiro/recorrentes`).
2. Cada template guarda: descrição, fornecedor, loja, categoria, conta bancária, dia de vencimento, forma de pagamento, tipo (**Fixo** ou **Variável**) e valor padrão (opcional para variáveis).
3. Todo dia 1º do mês (cron) o sistema gera automaticamente as contas do mês:
   - **Fixo** (SAIPOS, VIVO, Condomínio, Internet): entra já com o valor cadastrado, status `pending`.
   - **Variável** (Água, Luz): entra com valor 0 e status `pending_amount` — aparece com badge "Aguardando valor" no extrato para o usuário editar quando chegar a fatura.
4. Botão **"Gerar agora"** na página para rodar manualmente no mês corrente (útil na primeira ativação).
5. Idempotência: cada `accounts_payable` gerado carrega `recurring_template_id` + `competence_month`. Se já existe para aquele mês, não recria.

## Limpeza dos duplicados atuais
Antes de ativar, remover as duplicatas já mapeadas (SAIPOS 10 pares, VIVO 2, Condomínio, CAESB/Neo/Internet) mantendo o lançamento mais antigo de cada par. Rodo isso em migração de dados separada, com preview antes.

## Detalhes técnicos

### Nova tabela `recurring_payables`
Campos principais: `description`, `supplier_id`, `store_id`, `category_id`, `bank_account_id`, `payment_method`, `due_day` (1-31), `default_amount`, `kind` ('fixed' | 'variable'), `active`, `start_month`, `end_month` (opcional), `notes`.

RLS igual a `accounts_payable` (gestores/financeiro leem e editam). GRANTs para authenticated + service_role.

### Alterações em `accounts_payable`
Adicionar colunas: `recurring_template_id uuid` (FK) e `competence_month date` (primeiro dia do mês de competência). Índice único parcial `(recurring_template_id, competence_month) WHERE recurring_template_id IS NOT NULL` garante idempotência.

Novo status opcional `pending_amount` (ou flag `awaiting_amount boolean`) para variáveis sem valor.

### Edge function `generate-recurring-payables`
- Roda para um mês/ano informado (default: mês corrente).
- Para cada template ativo com `start_month <= mês <= end_month`, tenta inserir em `accounts_payable`. Conflito no índice único = ignora.
- Retorna resumo (`created`, `skipped`).

### Cron
`pg_cron` no dia 1 de cada mês às 06:00 chama a edge function via `pg_net`.

### UI
- Página `/financeiro/recorrentes`: tabela com filtros (loja/categoria/ativo), CRUD em dialog, botão "Gerar mês atual".
- No extrato/contas a pagar: badge "🔁 Recorrente" quando `recurring_template_id` estiver preenchido, e badge "Aguardando valor" para `awaiting_amount`.
- Link rápido no card de Financeiro / Contabilidade.

## Ordem de execução
1. Migração: tabela + colunas + índice + GRANTs + RLS.
2. Edge function + cron.
3. Página + integração no extrato.
4. Migração de dados: dedup dos lançamentos duplicados atuais.
5. Sugerir cadastro inicial dos recorrentes conhecidos (SAIPOS, VIVO, Condomínio, Internet, CAESB, Neo Energia).

Confirma e sigo com o passo 1 (migração)?
