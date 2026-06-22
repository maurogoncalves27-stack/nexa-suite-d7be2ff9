## Objetivo

Aproveitar o fato de que **todo "Pagamento de lote" no extrato C6 nasceu de uma exportação XLS feita pelo próprio sistema** para conciliar automaticamente: o usuário clica uma vez e o sistema cria N contas a pagar (uma por pessoa do lote), já com fornecedor, valor, descrição, categoria e loja preenchidos, vinculadas à mesma `bank_transaction`.

Critério de casamento: **total + data (± 1 dia)**. Se houver mais de um lote candidato, o usuário escolhe na hora.

## Mudanças

### 1. Banco — registrar lotes C6

Migração com duas tabelas novas:

- **`c6_payment_batches`**
  - `id uuid pk`
  - `source` text — `payroll | weekly_bonus | internship | freelancer | rescission | training | other`
  - `source_ref` text — id/descrição livre (ex.: "Folha 2026-05", "Bonificação semana 17/05")
  - `payment_date date` — data de pagamento informada no XLS
  - `total numeric(14,2)` — soma das linhas válidas exportadas
  - `line_count int`
  - `file_name text`
  - `category_id uuid` — categoria financeira default sugerida (ex.: Folha, Bonificações). Nullable.
  - `default_store_id uuid` — loja default (ex.: loja sede). Nullable; cada linha pode sobrescrever.
  - `bank_transaction_id uuid null` — preenchido quando conciliado
  - `reconciled_at timestamptz null`, `reconciled_by uuid null`
  - `created_at`, `created_by`
- **`c6_payment_batch_lines`**
  - `id uuid pk`
  - `batch_id uuid fk -> c6_payment_batches(id) on delete cascade`
  - `name text` — nome do beneficiário (sanitizado)
  - `pix_key text`
  - `pix_key_type text null`
  - `amount numeric(14,2)`
  - `description text null`
  - `employee_id uuid null` — quando origem tem vínculo direto
  - `store_id uuid null` — se a linha tem loja específica (ex.: bonificação por loja)
  - `category_id uuid null`
  - `created_payable_id uuid null` — preenchido após conciliação

GRANTs para `authenticated`/`service_role`. RLS: admin/manager fazem tudo; demais sem acesso.

### 2. `exportC6PixFile` — passa a aceitar metadados e a gravar o lote

Estender a assinatura **sem quebrar callers**:

```ts
export interface ExportC6Options {
  rows: C6PixRow[];
  fileName: string;
  paymentDate?: Date;
  // novos (opcionais por compat, mas todos os callers serão atualizados)
  source?: BatchSource;        // 'payroll' | 'weekly_bonus' | 'internship' | 'freelancer' | 'rescission' | 'training' | 'other'
  sourceRef?: string;
  defaultStoreId?: string | null;
  defaultCategoryId?: string | null;
  // cada row pode ter overrides:
  // employeeId, storeId, categoryId (adicionar campos opcionais em C6PixRow)
}
```

Antes do download, faz `INSERT` em `c6_payment_batches` + `c6_payment_batch_lines` com as linhas **válidas** que foram para o arquivo (mesma lista que vai para `finalValid`). Se o insert falhar, ainda baixa o arquivo (logar warning) — não bloquear o usuário.

Atualizar os 6 callers conhecidos para passar `source` / `sourceRef`:

- `InternshipPaymentsPanel` → `source: 'internship'`
- `Rescissions` → `source: 'rescission'`
- `WeeklyPaymentsPanel` → `source: 'weekly_bonus'`
- `TrainingReceipts` → `source: 'training'`
- `FreelancerDailyPayments` → `source: 'freelancer'`
- Qualquer ponto da folha mensal que use (vou procurar; provavelmente `PayrollSummaryPanel`/`ConsolidateSequentialDialog`) → `source: 'payroll'`

Cada caller também passa `defaultCategoryId` apropriado (Folha, Bonificações, Estágio, Freelancer, Rescisão, Treinamento), criando a categoria se não existir.

### 3. Conciliação — detectar e oferecer "Conciliar lote"

No `BankReconciliationPanel`, para cada transação de débito ainda não conciliada:

- Buscar lotes C6 abertos (`bank_transaction_id IS NULL`) com `total == abs(tx.amount)` e `payment_date` dentro de ± 1 dia de `tx.posted_at`.
- Quando há ≥ 1 candidato, mostrar badge **"Lote C6"** ao lado de "Sem sugestão" e um botão extra **"Conciliar lote"** ao lado de "+ Gerar lançamento".

Clicando em "Conciliar lote":

- **1 candidato** → confirma com toast "X lançamentos serão criados" e aplica direto.
- **N candidatos** → abre um pequeno dialog `PickC6BatchDialog` listando cada lote (origem, ref, data, total, nº de linhas) para escolher.

### 4. RPC `reconcile_bank_tx_with_c6_batch`

`SECURITY DEFINER`, admin/manager. Recebe `_transaction_id uuid`, `_batch_id uuid`.

- Valida: tx existe, é débito, não conciliada; lote existe, não conciliado; `abs(tx.amount) == batch.total` (±0,01).
- Para cada `c6_payment_batch_lines`:
  - `INSERT` em `accounts_payable` com:
    - `store_id` = `line.store_id` ou `batch.default_store_id` (obrigatório — falha se nenhum dos dois existir)
    - `description` = `line.name` + (se existir) ` — ` + sufixo da origem (ex.: "Folha 2026-05")
    - `supplier_name` = `line.name`
    - `category_id` = `line.category_id` ou `batch.category_id`
    - `amount`, `due_date = tx.posted_at`, `paid_at = tx.posted_at`, `status = 'paid'`
    - `bank_account_id = tx.bank_account_id`, `bank_transaction_id = tx.id`
    - `competence_date = batch.payment_date` (data do pagamento do lote)
  - Atualiza `c6_payment_batch_lines.created_payable_id`.
- Marca `bank_transactions.reconciled_at = now()` e `c6_payment_batches.reconciled_at = now()` + `bank_transaction_id = tx.id`.

### 5. Reverter conciliação de lote

O `unreconcile_bank_transaction` atual desfaz a vinculação da tx, mas agora pode haver N AP atrelados a uma única tx via lote. Estender o RPC: se a tx estava vinculada a um lote C6, apagar as APs criadas por aquele lote (que estão referenciadas em `created_payable_id`) e limpar `bank_transaction_id` + `reconciled_at` do lote.

## Detalhes técnicos

- O lote registra o que **foi para o arquivo** (`finalValid`), não o que o usuário pediu, para garantir que o total bate com o que o C6 debitou.
- `total` é calculado server-side via trigger? Não — calculamos no insert (mesma soma já feita pelo `exportC6PixFile`) para evitar trigger extra. Adicional: `CHECK (total >= 0)`.
- O critério "± 1 dia" cobre o caso comum de C6 processar D+1.
- Múltiplos lotes do mesmo valor no mesmo dia: o `PickC6BatchDialog` resolve.
- Lotes antigos (gerados antes desta feature) ficam de fora do auto-match — usuário usa o fluxo manual de divisão.
- `defaultStoreId`/loja por linha: em folha sem split por loja, usa a loja "Sede"/administrativa default. Bonificações já têm loja por linha. Sem essa info, deixa NULL e a RPC exige `batch.default_store_id`.
- Compat dos callers existentes não fica quebrada se faltar o campo `source` — apenas não grava o lote (warning no console). Mas vou atualizar todos os callers para gravar.

## Fora do escopo

- Auto-conciliação de transações que NÃO sejam de lote C6 (PIX individual, transferências, etc.).
- Importação de retorno CNAB 240 do C6 (caminho alternativo, não necessário enquanto controlamos a origem dos lotes).
- Botão de "re-exportar" um lote salvo a partir do banco (pode ser feito depois).
