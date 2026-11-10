-- =====================================================================
--  Date Nails — fila do WhatsApp, pagamentos e tarefas agendadas
--  As funções abaixo só podem ser chamadas pelas Edge Functions (service_role).
-- =====================================================================

drop function if exists public.dn_claim_messages(text, int);
drop function if exists public.dn_finish_message(text, bigint, boolean, text);
drop function if exists public.dn_apply_payment(text, text, jsonb);

create or replace function public.dn_claim_messages(p_limit int default 30)
returns table (id bigint, studio_id uuid, kind text, to_phone text, body text, wa_instance text, wa_status text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  -- envios que travaram no meio voltam para nova tentativa
  update dn_messages m set status = 'erro', last_error = 'tempo esgotado' where m.status = 'enviando' and m.send_after < now() - interval '5 minutes';
  -- lembretes cujo horário já passou não fazem mais sentido
  update dn_messages m set status = 'cancelado', last_error = 'expirado'
   where m.status in ('pendente','erro') and m.kind = 'lembrete'
     and exists (select 1 from dn_bookings b where b.id = m.booking_id and (b.date + b.start_at::time) < dn_local_now());
  return query
  with due as (
    select m.id from dn_messages m
    where (m.status = 'pendente' or (m.status = 'erro' and m.attempts < 3 and m.created_at > now() - interval '1 day'))
      and m.send_after <= now()
    order by m.send_after limit p_limit for update skip locked)
  update dn_messages m set status = 'enviando', attempts = m.attempts + 1
  from due, dn_studios s
  where m.id = due.id and s.id = m.studio_id
  returning m.id, m.studio_id, m.kind, m.to_phone, m.body, s.wa_instance, s.wa_status;
end $$;

create or replace function public.dn_finish_message(p_id bigint, p_ok boolean, p_error text default '')
returns void language sql volatile security definer set search_path = public as $$
  update dn_messages set status = case when p_ok then 'enviado' else 'erro' end,
         sent_at = case when p_ok then now() else sent_at end, last_error = left(coalesce(p_error, ''), 500)
   where id = p_id $$;

create or replace function public.dn_apply_payment(p_reference text, p_raw jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p dn_payments; sub dn_subscriptions; base timestamptz;
begin
  select * into p from dn_payments where reference_id = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'pagamento não encontrado'); end if;
  if p.status = 'pago' then return jsonb_build_object('ok', true, 'already', true); end if;
  update dn_payments set status = 'pago', paid_at = now(), raw = coalesce(p_raw, raw) where id = p.id;
  select * into sub from dn_subscriptions where studio_id = p.studio_id for update;
  base := greatest(now(), coalesce(sub.paid_until, now()), case when sub.status = 'trial' then coalesce(sub.trial_ends_at, now()) else now() end);
  update dn_subscriptions set status = 'ativa', paid_until = base + make_interval(days => p.days), updated_at = now() where studio_id = p.studio_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.dn_claim_messages(int), public.dn_finish_message(bigint, boolean, text), public.dn_apply_payment(text, jsonb) from public, anon, authenticated;
grant execute on function public.dn_claim_messages(int), public.dn_finish_message(bigint, boolean, text), public.dn_apply_payment(text, jsonb) to service_role;

-- segredo antigo não é mais usado
drop table if exists dn_private.config;

-- marca assinaturas vencidas (só informativo; o acesso já é controlado pela data)
create or replace function public.dn_daily_housekeeping() returns void
language sql volatile security definer set search_path = public as $$
  update dn_subscriptions set status = 'vencida', updated_at = now()
   where status in ('trial','ativa') and greatest(coalesce(trial_ends_at, '-infinity'), coalesce(paid_until, '-infinity')) < now();
  update dn_payments set status = 'expirado' where status = 'pendente' and created_at < now() - interval '3 days';
  delete from dn_messages where created_at < now() - interval '120 days';
$$;
revoke execute on function public.dn_daily_housekeeping() from public, anon, authenticated;
revoke execute on function public.dn_book_core(uuid, bigint[], date, text, text, text, text, boolean, boolean) from public, anon, authenticated;

-- ---------- Tarefas agendadas (pg_cron + pg_net) ----------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('dn-whatsapp-dispatch', 'dn-housekeeping');
end $$;

-- a cada minuto: envia confirmações e lembretes que estão na hora
select cron.schedule('dn-whatsapp-dispatch', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ahtvsvysijmfqwfeuvrc.supabase.co/functions/v1/whatsapp-dispatch',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodHZzdnlzaWptZnF3ZmV1dnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMDY2NDQsImV4cCI6MjA3Njg4MjY0NH0.jLcTmE_oinKb_iy6T5Oyi_4Ii6-rTg-5466eHyUgUV4"}'::jsonb,
    body := '{}'::jsonb, timeout_milliseconds := 55000);
$cron$);

-- todo dia às 3h (UTC): limpeza e status de assinaturas
select cron.schedule('dn-housekeeping', '0 6 * * *', $cron$ select public.dn_daily_housekeeping(); $cron$);
