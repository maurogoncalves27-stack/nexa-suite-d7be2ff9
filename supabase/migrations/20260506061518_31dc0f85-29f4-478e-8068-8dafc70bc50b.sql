
-- Notifica fornecedor quando recebe pedido novo
CREATE OR REPLACE FUNCTION public.notify_supplier_new_po()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
  v_title TEXT;
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT user_id INTO v_user FROM public.suppliers WHERE id = NEW.supplier_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        v_user,
        'Novo pedido de compra recebido',
        'Confira a lista para faturar e informe eventuais cortes.',
        '/fornecedor'
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_notify_supplier ON public.purchase_orders;
CREATE TRIGGER trg_po_notify_supplier
AFTER INSERT OR UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_supplier_new_po();

-- Notifica gestores em cortes
CREATE OR REPLACE FUNCTION public.notify_managers_po_partial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
  v_supplier TEXT;
BEGIN
  IF NEW.status = 'partial' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(trade_name, legal_name) INTO v_supplier FROM public.suppliers WHERE id = NEW.supplier_id;
    FOR v_user IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        v_user,
        'Pedido com cortes',
        COALESCE(v_supplier, 'Fornecedor') || ' confirmou pedido com cortes.',
        '/cotacoes'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_notify_managers ON public.purchase_orders;
CREATE TRIGGER trg_po_notify_managers
AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_managers_po_partial();
