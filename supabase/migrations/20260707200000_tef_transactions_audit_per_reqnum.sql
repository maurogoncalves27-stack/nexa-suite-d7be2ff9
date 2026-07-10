-- Auditoria TEF: permite várias transações de teste com o mesmo sale_id (ex.: VENDA-1001).
-- O Extrator de RecNum precisa de uma linha por REQNUM, não um upsert por loja+venda.

DROP INDEX IF EXISTS public.idx_pdv_tef_tx_store_sale;

CREATE INDEX IF NOT EXISTS idx_pdv_tef_tx_store_sale
  ON public.pdv_tef_transactions(store_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_pdv_tef_tx_store_reqnum
  ON public.pdv_tef_transactions(store_id, paygo_reqnum)
  WHERE paygo_reqnum IS NOT NULL;
