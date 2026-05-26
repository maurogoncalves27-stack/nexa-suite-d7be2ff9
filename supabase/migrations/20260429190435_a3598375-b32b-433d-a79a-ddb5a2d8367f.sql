DELETE FROM public.accounts_payable
WHERE category_id IN (
  SELECT id FROM public.finance_categories
  WHERE name IN ('Folha de pagamento', 'Vale transporte')
);