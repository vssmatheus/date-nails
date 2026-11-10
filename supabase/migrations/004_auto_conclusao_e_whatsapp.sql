-- =====================================================================
--  Date Nails — conclusão automática e sessão do WhatsApp no banco
-- =====================================================================

-- 1) Marca quando o sistema concluiu sozinho (para a dona confirmar a forma de pagamento)
alter table public.dn_bookings add column if not exists auto_completed boolean not null default false;

-- 2) Passou o horário de término e não foi cancelado/falta → concluído.
--    O gatilho dn_bookings_after lança a entrada no financeiro.
create or replace function public.dn_auto_complete() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update dn_bookings
     set status = 'concluido', auto_completed = true
   where status in ('pendente', 'confirmado')
     and (date + end_at::time) <= dn_local_now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.dn_auto_complete() from public, anon, authenticated;

-- 3) O gatilho também mantém a forma de pagamento sincronizada no financeiro
create or replace function public.dn_bookings_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare s dn_studios; v_at timestamptz;
begin
  select * into s from dn_studios where id = new.studio_id;
  v_at := ((new.date + new.start_at::time) at time zone 'America/Sao_Paulo');

  if tg_op = 'INSERT' then
    if new.status in ('pendente','confirmado') then
      if s.wa_send_confirm then
        insert into dn_messages(studio_id, booking_id, kind, to_phone, body) values (s.id, new.id, 'confirmacao', new.client_phone, dn_render(s.tpl_confirm, new, s));
      end if;
      if s.wa_send_reminder and v_at - make_interval(mins => s.wa_reminder_minutes) > now() then
        insert into dn_messages(studio_id, booking_id, kind, to_phone, body, send_after)
        values (s.id, new.id, 'lembrete', new.client_phone, dn_render(s.tpl_reminder, new, s), v_at - make_interval(mins => s.wa_reminder_minutes));
      end if;
    end if;
    -- agendamento lançado já concluído (ex.: registro de atendimento passado)
    if new.status = 'concluido' and new.total > 0 then
      insert into dn_finance(studio_id, kind, category, description, amount, date, method, booking_id)
      values (new.studio_id, 'entrada', 'Atendimentos',
              new.client_name || ' — ' || coalesce((select string_agg(e->>'name', ' + ') from jsonb_array_elements(new.services) e), ''),
              new.total, new.date, new.payment_method, new.id)
      on conflict (booking_id) do nothing;
    end if;
    return new;
  end if;

  if new.status in ('cancelado','faltou') and old.status not in ('cancelado','faltou') then
    update dn_messages set status = 'cancelado' where booking_id = new.id and status = 'pendente';
  end if;
  if (new.date, new.start_at) is distinct from (old.date, old.start_at) and new.status in ('pendente','confirmado') then
    update dn_messages set status = 'cancelado' where booking_id = new.id and kind = 'lembrete' and status = 'pendente';
    if s.wa_send_reminder and v_at - make_interval(mins => s.wa_reminder_minutes) > now() then
      insert into dn_messages(studio_id, booking_id, kind, to_phone, body, send_after)
      values (s.id, new.id, 'lembrete', new.client_phone, dn_render(s.tpl_reminder, new, s), v_at - make_interval(mins => s.wa_reminder_minutes));
    end if;
  end if;
  if new.status = 'concluido' and old.status <> 'concluido' and new.total > 0 then
    insert into dn_finance(studio_id, kind, category, description, amount, date, method, booking_id)
    values (new.studio_id, 'entrada', 'Atendimentos',
            new.client_name || ' — ' || coalesce((select string_agg(e->>'name', ' + ') from jsonb_array_elements(new.services) e), ''),
            new.total, new.date, new.payment_method, new.id)
    on conflict (booking_id) do update set amount = excluded.amount, date = excluded.date, method = excluded.method;
  end if;
  if old.status = 'concluido' and new.status <> 'concluido' then
    delete from dn_finance where booking_id = new.id;
  end if;
  if new.status = 'concluido' and old.status = 'concluido'
     and (new.total, new.payment_method, new.date) is distinct from (old.total, old.payment_method, old.date) then
    if new.total > 0 then
      insert into dn_finance(studio_id, kind, category, description, amount, date, method, booking_id)
      values (new.studio_id, 'entrada', 'Atendimentos',
              new.client_name || ' — ' || coalesce((select string_agg(e->>'name', ' + ') from jsonb_array_elements(new.services) e), ''),
              new.total, new.date, new.payment_method, new.id)
      on conflict (booking_id) do update set amount = excluded.amount, date = excluded.date, method = excluded.method;
    else
      delete from dn_finance where booking_id = new.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.dn_bookings_after() from public, anon, authenticated;

-- 4) Sessões do WhatsApp (gateway Baileys guarda as chaves aqui; só o servidor acessa)
create table if not exists public.dn_wa_auth (
  instance text not null,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (instance, key)
);
alter table public.dn_wa_auth enable row level security;
revoke all on public.dn_wa_auth from anon, authenticated;

-- 5) Agenda: a cada 5 minutos conclui o que já passou
do $$ begin perform cron.unschedule(jobid) from cron.job where jobname = 'dn-auto-complete'; end $$;
select cron.schedule('dn-auto-complete', '*/5 * * * *', $cron$ select public.dn_auto_complete(); $cron$);
