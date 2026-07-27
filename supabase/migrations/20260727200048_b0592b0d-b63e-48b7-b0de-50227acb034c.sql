-- Remove RustDesk: todos os cadastros passam a ser AnyDesk.
UPDATE remote_access_machines
SET tool = 'anydesk'
WHERE tool = 'rustdesk';
