-- Adiciona coluna de subgrupo para organização visual
ALTER TABLE public.finance_categories
  ADD COLUMN IF NOT EXISTS subgroup text;

-- Preserva "Fornecedores" (que tem 3 vínculos) renomeando para "CMV"
UPDATE public.finance_categories
   SET name = 'CMV',
       subgroup = 'Custos Variáveis',
       dre_group = 'cmv',
       sort_order = 80
 WHERE name = 'Fornecedores' AND kind = 'expense';

-- Remove as categorias padrão antigas que não estão em uso
DELETE FROM public.finance_categories
 WHERE name IN (
   'Água','Aluguel','Energia elétrica','Folha de pagamento','Impostos',
   'Internet/Telefonia','Manutenção','Marketing','Outras despesas',
   'Estorno','Recebimentos diversos','Vendas'
 );

-- Insere a nova estrutura. Conflitos em (name,kind) são ignorados para preservar
-- qualquer categoria já existente com mesmo nome (ex: CMV recém renomeado).
INSERT INTO public.finance_categories (name, kind, dre_group, subgroup, sort_order, is_active) VALUES
  -- Receita Operacional
  ('Ifood',                                 'income',  'revenue_gross',     'Receita Operacional', 10, true),
  ('Delivery Direto',                       'income',  'revenue_gross',     'Receita Operacional', 11, true),
  ('Loja física',                           'income',  'revenue_gross',     'Receita Operacional', 12, true),

  -- Receita Não Operacional
  ('Aporte de capital',                     'income',  'non_operational',   'Receita Não Operacional', 50, true),
  ('Empréstimos',                           'income',  'non_operational',   'Receita Não Operacional', 51, true),
  ('Outras receitas não operacionais',      'income',  'non_operational',   'Receita Não Operacional', 52, true),
  ('Receita de aluguel',                    'income',  'non_operational',   'Receita Não Operacional', 53, true),
  ('Rendimentos de Aplicações',             'income',  'non_operational',   'Receita Não Operacional', 54, true),

  -- Custos Variáveis (CMV inserido só se não existir, pois pode já ter sido renomeado)
  ('Taxas Ifood',                           'expense', 'cmv',               'Custos Variáveis', 70, true),
  ('Taxas Delivery Direto',                 'expense', 'cmv',               'Custos Variáveis', 71, true),
  ('Taxas Stone e Rede',                    'expense', 'cmv',               'Custos Variáveis', 72, true),
  ('Simples Nacional - DAS',                'expense', 'expense_tax',       'Custos Variáveis', 73, true),
  ('Devoluções',                            'expense', 'revenue_deduction', 'Custos Variáveis', 74, true),
  ('Frete requisição/urgência (lalamove)',  'expense', 'cmv',               'Custos Variáveis', 75, true),
  ('Frete entrega pedido',                  'expense', 'cmv',               'Custos Variáveis', 76, true),
  ('CMV',                                   'expense', 'cmv',               'Custos Variáveis', 80, true),

  -- Despesas Administrativas
  ('Água e esgoto',                         'expense', 'expense_admin',     'Despesas Administrativas', 100, true),
  ('Aluguel',                               'expense', 'expense_admin',     'Despesas Administrativas', 101, true),
  ('Combustível',                           'expense', 'expense_admin',     'Despesas Administrativas', 102, true),
  ('Condomínio',                            'expense', 'expense_admin',     'Despesas Administrativas', 103, true),
  ('Consultoria',                           'expense', 'expense_admin',     'Despesas Administrativas', 104, true),
  ('Despesas com veiculos',                 'expense', 'expense_admin',     'Despesas Administrativas', 105, true),
  ('Energia elétrica',                      'expense', 'expense_admin',     'Despesas Administrativas', 106, true),
  ('Gás',                                   'expense', 'expense_admin',     'Despesas Administrativas', 107, true),
  ('Softwares',                             'expense', 'expense_admin',     'Despesas Administrativas', 108, true),
  ('Honorários contábeis',                  'expense', 'expense_admin',     'Despesas Administrativas', 109, true),
  ('Telefonia e Internet',                  'expense', 'expense_admin',     'Despesas Administrativas', 110, true),
  ('IPTU',                                  'expense', 'expense_tax',       'Despesas Administrativas', 111, true),
  ('IPVA para licenciamento',               'expense', 'expense_tax',       'Despesas Administrativas', 112, true),
  ('Manutenção de Automóvel',               'expense', 'expense_admin',     'Despesas Administrativas', 113, true),
  ('Manutenção Equipamentos',               'expense', 'expense_admin',     'Despesas Administrativas', 114, true),
  ('Manutenção do Espaço Físico',           'expense', 'expense_admin',     'Despesas Administrativas', 115, true),
  ('Marketing',                             'expense', 'expense_marketing', 'Despesas Administrativas', 116, true),
  ('Material de limpeza',                   'expense', 'expense_admin',     'Despesas Administrativas', 117, true),
  ('Nutricionista',                         'expense', 'expense_admin',     'Despesas Administrativas', 118, true),
  ('Seguros',                               'expense', 'expense_admin',     'Despesas Administrativas', 119, true),
  ('Outras despesas administrativas',       'expense', 'expense_admin',     'Despesas Administrativas', 120, true),
  ('Outros investimentos desenv. empresarial','expense','expense_admin',    'Despesas Administrativas', 121, true),
  ('Compra de Utensílios/equipamentos',     'expense', 'expense_admin',     'Despesas Administrativas', 122, true),
  ('Frete Deslocamento de funcionários/itens','expense','expense_admin',    'Despesas Administrativas', 123, true),
  ('Materiais de escritório',               'expense', 'expense_admin',     'Despesas Administrativas', 124, true),
  ('Tarifas Bancárias',                     'expense', 'expense_financial', 'Despesas Administrativas', 125, true),
  ('Taxa de Antecipação',                   'expense', 'expense_financial', 'Despesas Administrativas', 126, true),
  ('Taxa de Aluguel Maq Rede',              'expense', 'expense_financial', 'Despesas Administrativas', 127, true),

  -- Despesas com Pessoal
  ('Alimentação Interna',                   'expense', 'expense_personnel', 'Despesas com Pessoal', 150, true),
  ('Benefícios',                            'expense', 'expense_personnel', 'Despesas com Pessoal', 151, true),
  ('Outras despesas com pessoal',           'expense', 'expense_personnel', 'Despesas com Pessoal', 152, true),
  ('Bonificação',                           'expense', 'expense_personnel', 'Despesas com Pessoal', 153, true),
  ('Diárias / Folguistas',                  'expense', 'expense_personnel', 'Despesas com Pessoal', 154, true),
  ('FGTS',                                  'expense', 'expense_personnel', 'Despesas com Pessoal', 155, true),
  ('Exames Admissionais/Demissionais',      'expense', 'expense_personnel', 'Despesas com Pessoal', 156, true),
  ('INSS',                                  'expense', 'expense_personnel', 'Despesas com Pessoal', 157, true),
  ('Prestação de serviços',                 'expense', 'expense_personnel', 'Despesas com Pessoal', 158, true),
  ('Rescisões',                             'expense', 'expense_personnel', 'Despesas com Pessoal', 159, true),
  ('Salários',                              'expense', 'expense_personnel', 'Despesas com Pessoal', 160, true),
  ('Férias',                                'expense', 'expense_personnel', 'Despesas com Pessoal', 161, true),
  ('13º Salário',                           'expense', 'expense_personnel', 'Despesas com Pessoal', 162, true),
  ('Treinamento',                           'expense', 'expense_personnel', 'Despesas com Pessoal', 163, true),
  ('Vale transporte treinamento',           'expense', 'expense_personnel', 'Despesas com Pessoal', 164, true),
  ('Vale transporte',                       'expense', 'expense_personnel', 'Despesas com Pessoal', 165, true),

  -- Despesas Não Operacional
  ('Juros e multas',                        'expense', 'non_operational',   'Despesas Não Operacional', 200, true),
  ('Pagamento de Empréstimos',              'expense', 'non_operational',   'Despesas Não Operacional', 201, true),
  ('Aquisição de Imobilizados',             'expense', 'non_operational',   'Despesas Não Operacional', 202, true),
  ('Outras saídas não operacionais',        'expense', 'non_operational',   'Despesas Não Operacional', 203, true),
  ('Construções e reformas',                'expense', 'non_operational',   'Despesas Não Operacional', 204, true),
  ('Distribuição de lucros',                'expense', 'non_operational',   'Despesas Não Operacional', 205, true),
  ('Impostos sobre Aplicações',             'expense', 'expense_tax',       'Despesas Não Operacional', 206, true),
  ('Parcelamento Simples Nacional',         'expense', 'expense_tax',       'Despesas Não Operacional', 207, true),

  -- Movimentações estornadas
  ('Movimentações estornadas (entradas)',   'income',  'excluded',          'Movimentações estornadas', 250, true),
  ('Movimentações estornadas (saídas)',     'expense', 'excluded',          'Movimentações estornadas', 251, true)
ON CONFLICT (name, kind) DO NOTHING;