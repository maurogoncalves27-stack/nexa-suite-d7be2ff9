alter table public.stores add column if not exists ifood_auto_accept boolean not null default true;
update public.stores set ifood_auto_accept = false where name = 'iFood Homologação';