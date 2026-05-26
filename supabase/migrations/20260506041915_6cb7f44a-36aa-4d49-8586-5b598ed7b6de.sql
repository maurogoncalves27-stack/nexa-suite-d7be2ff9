-- Marcas homologadas por item da cotação
CREATE TABLE public.quotation_item_approved_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_item_id UUID NOT NULL REFERENCES public.quotation_items(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quotation_item_id, brand_name)
);

CREATE INDEX idx_qiab_item ON public.quotation_item_approved_brands(quotation_item_id);

ALTER TABLE public.quotation_item_approved_brands ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer fornecedor aprovado vê marcas das cotações abertas; equipe interna vê tudo
CREATE POLICY "Approved brands readable by suppliers and staff"
ON public.quotation_item_approved_brands
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotation_items qi
    JOIN public.quotations q ON q.id = qi.quotation_id
    WHERE qi.id = quotation_item_id
  )
);

-- Escrita: apenas usuários com role admin/manager (mesmas regras das demais tabelas de cotação)
CREATE POLICY "Staff can manage approved brands"
ON public.quotation_item_approved_brands
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- Marca ofertada pelo fornecedor (precisa ser uma das homologadas, validado em app)
ALTER TABLE public.quotation_bid_items
  ADD COLUMN IF NOT EXISTS offered_brand TEXT;