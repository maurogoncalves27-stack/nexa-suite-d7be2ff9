ALTER TABLE public.dfe_inbound_items
ADD CONSTRAINT dfe_inbound_items_note_line_uk UNIQUE (note_id, line_number);