
ALTER TABLE public.quotation_bid_items
  ADD COLUMN IF NOT EXISTS is_fifo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_date date;
