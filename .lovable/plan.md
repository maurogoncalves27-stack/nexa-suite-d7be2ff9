## Objetivo

Hoje o botão **Gerar lançamento** cria UMA conta a pagar/receber com o valor total da transação bancária. Para casos como "Pagamento de lote #806 — R$ 2.830,00", o usuário precisa **quebrar manualmente** essa transação em N lançamentos (um por beneficiário), cada um com sua loja, categoria, descrição e data de competência. A soma das linhas deve bater com o valor total da transação, e todas ficam vinculadas à mesma `bank_transaction` (que entra como conciliada).

## Mudanças

### 1. Diálogo `CreateFinanceFromTxDialog`
- Trocar o formulário de "uma linha só" por uma **lista de divisões**, cada linha com:
  - Descrição *
  - Fornecedor / Pagador
  - Categoria (mantém o "Gerenciar")
  - Loja *
  - Data de competência (default = data da transação)
  - Valor * (default da 1ª linha = total da transação)
- Botões **+ Adicionar linha** e **Remover** por linha.
- Rodapé mostra **Total dividido / Total da transação / Diferença** em tempo real. Botão "Criar" só habilita quando a diferença é R$ 0,00 (tolerância R$ 0,01).
- Atalho: botão **"Dividir igualmente"** quando há ≥ 2 linhas (distribui o total proporcionalmente, com ajuste de centavos na última linha).
- Sugestões do histórico continuam disponíveis e aplicam à linha focada.
- Manter o caminho atual de "1 linha só" como caso particular (o usuário pode simplesmente não adicionar mais linhas).

### 2. Backend — novas RPCs que aceitam várias linhas

Criar duas funções novas (sem quebrar as antigas, que continuam usadas pelo caminho de 1 linha):

- `create_payables_from_bank_tx(_transaction_id uuid, _lines jsonb)`
- `create_receivables_from_bank_tx(_transaction_id uuid, _lines jsonb)`

Cada item de `_lines` traz: `store_id`, `description`, `party_name`, `category_id`, `competence_date`, `amount`.

Regras dentro da função:
- Permissão admin/manager (igual às RPCs atuais).
- Carrega a transação, valida sinal (débito → payables / crédito → receivables) e que não está conciliada.
- Valida que `sum(amount) == abs(tx.amount)` com tolerância 0,01; senão `RAISE EXCEPTION`.
- Insere N linhas em `accounts_payable` ou `accounts_receivable`, todas com o mesmo `bank_transaction_id`, `bank_account_id`, status `paid`/`received`, datas de pagamento/recebimento = `tx.posted_at`, e `competence_date` da linha (fallback `tx.posted_at`).
- Marca `bank_transactions.reconciled_at = now()` ao final.
- Tudo em uma transação implícita do plpgsql (rollback automático se algo falhar).

### 3. Tela de Conciliação (`BankReconciliationPanel`)
- Sem mudança de fluxo; o diálogo aberto pelo "+ Gerar lançamento" agora suporta divisão. Após sucesso, faz `loadData()` como hoje.
- Manter `inheritAllocationsFromSource` desligado para este caso (cada linha já tem sua própria loja, não precisa de rateio extra).

### 4. Extrato financeiro (`FinanceStatementPanel`)
- Já lê `competence_date` e `bank_transaction_id` — múltiplas contas a pagar com o mesmo `bank_transaction_id` aparecem naturalmente como lançamentos separados. Sem mudança.

## Detalhes técnicos

- Tipo da linha no front:
  ```ts
  type SplitLine = {
    store_id: string;
    description: string;
    party_name: string;
    category_id: string;
    competence_date: string; // yyyy-mm-dd
    amount: number;          // sempre positivo
  };
  ```
- Validação no front antes de chamar a RPC: todas as linhas com `store_id`, `description` e `amount > 0`; soma == `abs(tx.amount)` ± 0,01.
- A RPC nova chama-se no lugar de `create_payable_from_bank_tx` / `create_receivable_from_bank_tx` quando há ≥ 1 linha (sempre vai pela nova; a antiga fica como fallback caso algo dê erro de assinatura).
- Sem mudança de RLS — as RPCs são `SECURITY DEFINER` e já validam role.

## Fora do escopo

- Importação de arquivo CNAB 240 para explodir o lote automaticamente.
- Mudanças no fluxo de "Vincular" (conciliação contra contas a pagar já existentes) — segue como hoje.
