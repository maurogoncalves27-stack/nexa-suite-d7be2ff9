
-- Função que cria advertência automática quando uma infração do tipo "FALTA" é inserida
create or replace function public.auto_warning_on_falta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falta_type_id uuid := '70657a3f-5811-4d06-92f6-52df6c10e9af';
  v_employee_name text;
  v_occurred_fmt text;
  v_already_exists boolean;
begin
  -- Só age para o tipo FALTA
  if new.infraction_type_id <> v_falta_type_id then
    return new;
  end if;

  -- Idempotência: não duplica advertência para a mesma falta (mesmo dia, mesmo colaborador, título de falta)
  select exists(
    select 1
    from public.employee_warnings w
    where w.employee_id = new.employee_id
      and w.title ilike '%falta%'
      and date(w.issued_at) = new.occurred_on
  ) into v_already_exists;

  if v_already_exists then
    return new;
  end if;

  -- Pega nome do colaborador
  select full_name into v_employee_name
  from public.employees
  where id = new.employee_id;

  v_occurred_fmt := to_char(new.occurred_on, 'DD/MM/YYYY');

  insert into public.employee_warnings (employee_id, title, content, status, issued_by)
  values (
    new.employee_id,
    'Advertência escrita — falta não justificada',
    format(
      'O(a) colaborador(a) %s registrou falta no dia %s sem apresentação de justificativa válida (atestado médico, declaração ou justificativa aprovada pela gestão).' || E'\n\n' ||
      'Conforme as normas internas e a CLT, a ausência injustificada acarreta:' || E'\n' ||
      '• Desconto do dia não trabalhado;' || E'\n' ||
      '• Desconto do DSR (Descanso Semanal Remunerado) da semana correspondente;' || E'\n' ||
      '• Registro formal nesta advertência escrita.' || E'\n\n' ||
      'Fica formalmente advertido(a). A reincidência poderá acarretar medidas disciplinares mais severas, incluindo suspensão e/ou rescisão por justa causa, nos termos do art. 482 da CLT.' || E'\n\n' ||
      'Esta advertência foi gerada automaticamente pelo sistema no momento do registro da infração de falta.',
      coalesce(v_employee_name, 'colaborador'),
      v_occurred_fmt
    ),
    'pending',
    new.created_by
  );

  return new;
end;
$$;

drop trigger if exists trg_auto_warning_on_falta on public.employee_infractions;
create trigger trg_auto_warning_on_falta
after insert on public.employee_infractions
for each row
execute function public.auto_warning_on_falta();
