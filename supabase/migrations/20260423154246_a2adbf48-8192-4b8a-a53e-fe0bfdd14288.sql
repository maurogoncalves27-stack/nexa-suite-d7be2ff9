-- Adiciona agrupamento DRE nas categorias financeiras
ALTER TABLE public.finance_categories
  ADD COLUMN IF NOT EXISTS dre_group text;

-- Validação dos grupos permitidos (NULL é permitido = não classificado)
ALTER TABLE public.finance_categories
  DROP CONSTRAINT IF EXISTS finance_categories_dre_group_check;
ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_dre_group_check
  CHECK (dre_group IS NULL OR dre_group IN (
    'revenue_gross',
    'revenue_deduction',
    'cmv',
    'expense_personnel',
    'expense_admin',
    'expense_marketing',
    'expense_financial',
    'expense_tax',
    'expense_other',
    'non_operational',
    'excluded'
  ));

-- Permite excluir manualmente lançamentos da DRE
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS dre_excluded boolean NOT NULL DEFAULT false;

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS dre_excluded boolean NOT NULL DEFAULT false;

-- Pré-mapeamento das categorias padrão para os grupos DRE
UPDATE public.finance_categories SET dre_group = 'revenue_gross'    WHERE name = 'Vendas' AND kind = 'income';
UPDATE public.finance_categories SET dre_group = 'revenue_deduction' WHERE name = 'Estorno' AND kind = 'income';
UPDATE public.finance_categories SET dre_group = 'expense_other'     WHERE name = 'Recebimentos diversos' AND kind = 'income';

UPDATE public.finance_categories SET dre_group = 'cmv'                WHERE name = 'Fornecedores' AND kind = 'expense';
UPDATE public.finance_categories SET dre_group = 'expense_personnel'  WHERE name = 'Folha de pagamento' AND kind = 'expense';
UPDATE public.finance_categories SET dre_group = 'expense_admin'      WHERE name IN ('Aluguel','Energia elétrica','Água','Internet/Telefonia','Manutenção') AND kind = 'expense';
UPDATE public.finance_categories SET dre_group = 'expense_marketing'  WHERE name = 'Marketing' AND kind = 'expense';
UPDATE public.finance_categories SET dre_group = 'expense_tax'        WHERE name = 'Impostos' AND kind = 'expense';
UPDATE public.finance_categories SET dre_group = 'expense_other'      WHERE name = 'Outras despesas' AND kind = 'expense';