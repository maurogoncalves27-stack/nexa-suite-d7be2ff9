
-- 1) Adiciona coluna suspension_days
alter table public.employee_infractions
  add column if not exists suspension_days integer not null default 0;

-- 2) Cria tipo de infração de suspensão (peso 10, 3 dias padrão)
insert into public.infraction_types (name, default_weight, description)
select 'SUSPENSÃO POR ACÚMULO DE ADVERTÊNCIAS', 10,
       'Aplicada automaticamente quando o colaborador acumula 3 ou mais advertências em 30 dias.'
where not exists (
  select 1 from public.infraction_types where name = 'SUSPENSÃO POR ACÚMULO DE ADVERTÊNCIAS'
);

-- 3) Função: ao inserir advertência, conta últimos 30 dias e cria suspensão se >= 3
create or replace function public.auto_suspend_on_warning_accumulation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_already_suspended boolean;
  v_susp_type_id uuid;
  v_employee_name text;
  v_start_date date := (now() at time zone 'America/Sao_Paulo')::date + 1; -- começa amanhã
  v_end_date date := ((now() at time zone 'America/Sao_Paulo')::date + 3); -- 3 dias
  v_inf_id uuid;
  v_cycle_id uuid;
  v_recipient record;
  v_notif_title text;
  v_notif_msg text;
begin
  -- Conta advertências dos últimos 30 dias para este colaborador
  select count(*) into v_count
  from public.employee_warnings
  where employee_id = new.employee_id
    and issued_at >= now() - interval '30 days';

  if v_count < 3 then
    return new;
  end if;

  -- Não duplicar: se já houve suspensão automática nos últimos 30 dias, sai
  select id into v_susp_type_id
  from public.infraction_types
  where name = 'SUSPENSÃO POR ACÚMULO DE ADVERTÊNCIAS'
  limit 1;

  if v_susp_type_id is null then
    return new;
  end if;

  select exists(
    select 1 from public.employee_infractions
    where employee_id = new.employee_id
      and infraction_type_id = v_susp_type_id
      and created_at >= now() - interval '30 days'
  ) into v_already_suspended;

  if v_already_suspended then
    return new;
  end if;

  select full_name into v_employee_name from public.employees where id = new.employee_id;

  -- Pega ciclo atual (se existir)
  select id into v_cycle_id
  from public.evaluation_cycles
  where start_date <= v_start_date and end_date >= v_start_date
  order by start_date desc
  limit 1;

  -- Cria a infração-suspensão
  insert into public.employee_infractions (
    employee_id, infraction_type_id, cycle_id, occurred_on,
    applied_weight, suspension_days, suspension_start_date, suspension_end_date,
    notes
  ) values (
    new.employee_id, v_susp_type_id, v_cycle_id,
    (now() at time zone 'America/Sao_Paulo')::date,
    10, 3, v_start_date, v_end_date,
    format('Suspensão automática proposta (3 dias) — %s acumulou %s advertências nos últimos 30 dias. Aguarda aprovação do gestor.',
      coalesce(v_employee_name, 'colaborador'), v_count)
  )
  returning id into v_inf_id;

  -- Notifica admins e RH no sino
  v_notif_title := 'Suspensão proposta — ' || coalesce(v_employee_name, 'colaborador');
  v_notif_msg := format('%s acumulou %s advertências em 30 dias. Foi criada uma proposta de suspensão de 3 dias (%s a %s) aguardando sua aprovação.',
    coalesce(v_employee_name, 'colaborador'), v_count,
    to_char(v_start_date, 'DD/MM'), to_char(v_end_date, 'DD/MM'));

  for v_recipient in
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role in ('admin', 'rh')
  loop
    insert into public.user_notifications (user_id, title, message, url, category, tag)
    values (
      v_recipient.user_id,
      v_notif_title,
      v_notif_msg,
      '/infracoes',
      'hr',
      'suspension-proposed-' || v_inf_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_auto_suspend_on_warning on public.employee_warnings;
create trigger trg_auto_suspend_on_warning
after insert on public.employee_warnings
for each row
execute function public.auto_suspend_on_warning_accumulation();
