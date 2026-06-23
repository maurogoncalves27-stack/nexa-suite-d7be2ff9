DELETE FROM support_tickets WHERE contact LIKE '619999000%' OR contact = 'não informado';
DELETE FROM reservations WHERE phone LIKE '619999000%' OR name ILIKE 'gustavo';
DELETE FROM chat_conversations WHERE session_id LIKE 'test-%';