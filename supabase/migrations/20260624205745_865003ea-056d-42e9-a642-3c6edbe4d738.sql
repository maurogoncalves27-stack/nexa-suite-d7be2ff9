DROP POLICY IF EXISTS "Anyone can create a reservation" ON public.reservations;

CREATE POLICY "Anyone can create a reservation"
ON public.reservations
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(btrim(name)) BETWEEN 2 AND 120
  AND length(btrim(phone)) BETWEEN 8 AND 20
  AND phone ~ '^[0-9 ()+\-]{8,20}$'
  AND (email IS NULL OR (length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND party_size BETWEEN 1 AND 50
  AND reservation_date BETWEEN current_date AND (current_date + interval '1 year')
  AND (notes IS NULL OR length(notes) <= 1000)
  AND status = 'pending'
);