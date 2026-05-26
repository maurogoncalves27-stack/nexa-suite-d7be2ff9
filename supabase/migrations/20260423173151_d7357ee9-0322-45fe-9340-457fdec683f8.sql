-- Mapear cargos existentes para os códigos CBO conforme tabela fornecida pelo usuário
-- Estagiário e Trainee permanecem isentos (sem CBO)

UPDATE public.employees SET cbo_code='2524-05', cbo_title='Analista de recursos humanos' WHERE position ILIKE 'ANALISTA DE RH';
UPDATE public.employees SET cbo_code='5134-35', cbo_title='Atendente de lanchonete' WHERE position ILIKE 'Atendente';
UPDATE public.employees SET cbo_code='4110-10', cbo_title='Assistente administrativo' WHERE position ILIKE 'Auxiliar administrativo';
UPDATE public.employees SET cbo_code='5135-05', cbo_title='Auxiliar de cozinha' WHERE position ILIKE 'Auxiliar de cozinha';
UPDATE public.employees SET cbo_code='7842-05', cbo_title='Operador de empilhadeira' WHERE position ILIKE 'Auxiliar de produção';
UPDATE public.employees SET cbo_code='4101-05', cbo_title='Supervisor administrativo' WHERE position ILIKE 'Encarregado de escritório';
UPDATE public.employees SET cbo_code='5101-30', cbo_title='Encarregado de cozinha' WHERE position ILIKE 'Encarregado de produção';
UPDATE public.employees SET cbo_code='4141-05', cbo_title='Almoxarife' WHERE position ILIKE 'Estoquista';
UPDATE public.employees SET cbo_code='1415-10', cbo_title='Gerente de loja e supermercado' WHERE position ILIKE 'Gerente Geral';
UPDATE public.employees SET cbo_code='4101-05', cbo_title='Supervisor administrativo' WHERE position ILIKE 'Supervisor de Loja';

-- Garantir que Estagiário e Trainee permaneçam sem CBO
UPDATE public.employees SET cbo_code=NULL, cbo_title=NULL WHERE position ILIKE 'Estagiário' OR position ILIKE 'Estagiario' OR position ILIKE 'Trainee';