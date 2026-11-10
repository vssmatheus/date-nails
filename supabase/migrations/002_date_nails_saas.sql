-- =====================================================================
--  Date Nails — SaaS multi-studio (v2)
--  Tabelas com prefixo dn_ para conviver com outros apps no mesmo projeto.
-- =====================================================================

-- ---------- Limpeza da v1 (single-studio, sem dados reais) ----------
drop function if exists public.dn_book(bigint[], date, text, text, text, text, boolean, boolean);
drop function if exists public.dn_free_slots(date, int, bigint, boolean);
drop function if exists public.dn_availability(int);
drop function if exists public.dn_get_config();
drop function if exists public.dn_admin_clients();
drop function if exists public.dn_admin_stats(date, date);
drop table if exists public.dn_bookings, public.dn_blocks, public.dn_services, public.dn_settings, public.dn_admins cascade;
drop function if exists public.dn_is_admin() cascade;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------- Plataforma ----------
create table if not exists public.dn_platform (
  id int primary key default 1 check (id = 1),
  saas_name text not null default 'Date Nails',
  site_url text not null default '',            -- ex.: https://datenails.com.br (sem barra final)
  plan_name text not null default 'Plano Studio',
  plan_price int not null default 3990,         -- centavos
  trial_days int not null default 7,
  support_whatsapp text not null default ''
);
insert into public.dn_platform (id) values (1) on conflict do nothing;

create table if not exists public.dn_superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create schema if not exists dn_private;
revoke all on schema dn_private from public, anon, authenticated;
create table if not exists dn_private.config (k text primary key, v text not null);
insert into dn_private.config (k, v) values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (k) do nothing;

-- ---------- Studios ----------
create table if not exists public.dn_studios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$'),
  name text not null,
  tagline text not null default 'Agende seu horário online, em poucos toques.',
  logo_url text not null default '',
  show_name boolean not null default true,
  name_style text not null default 'script' check (name_style in ('script','sans')),
  theme text not null default 'rosa',
  segment text not null default 'Nail design',
  whatsapp text not null default '',
  instagram text not null default '',
  address text not null default '',
  maps_url text not null default '',
  hours jsonb not null default '{"0":null,"1":null,"2":["09:00","19:00"],"3":["09:00","19:00"],"4":["09:00","19:00"],"5":["09:00","19:00"],"6":["08:00","14:00"]}',
  break_time jsonb not null default '["12:00","13:00"]',
  step int not null default 30 check (step between 5 and 120),
  min_advance_hours int not null default 2 check (min_advance_hours between 0 and 168),
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 120),
  cancel_min_hours int not null default 24 check (cancel_min_hours between 0 and 168),
  auto_confirm boolean not null default false,
  deposit_text text not null default '',
  policy text not null default 'Tolerância de 10 minutos. Para remarcar ou cancelar, avise com antecedência.',
  -- WhatsApp
  wa_instance text not null default '',
  wa_status text not null default 'desconectado',
  wa_send_confirm boolean not null default true,
  wa_send_reminder boolean not null default true,
  wa_reminder_minutes int not null default 60 check (wa_reminder_minutes between 15 and 1440),
  tpl_booking text not null default 'Oi! Acabei de agendar pelo site 💅

*{servicos}*
📅 {data} às {hora}
💰 {valor}

Nome: {nome}
Código: {codigo}',
  tpl_confirm text not null default 'Oi, {nome}! Seu horário no {studio} está reservado 💖

*{servicos}*
📅 {data} às {hora}
📍 {endereco}

Ver, adicionar à agenda ou cancelar: {link}',
  tpl_reminder text not null default 'Oi, {nome}! Seu horário no {studio} é daqui a {antecedencia} ✨

📅 {data} às {hora}
💅 {servicos}
📍 {endereco}

Detalhes: {link}',
  tpl_thanks text not null default '{nome}, obrigada pela visita hoje! 💕 Sua próxima manutenção fica ótima em cerca de 3 semanas. Agende aqui: {agendar}',
  created_at timestamptz not null default now()
);

create table if not exists public.dn_subscriptions (
  studio_id uuid primary key references public.dn_studios(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','ativa','vencida','cancelada')),
  trial_ends_at timestamptz,
  paid_until timestamptz,
  plan_price int not null default 3990,
  updated_at timestamptz not null default now()
);

create table if not exists public.dn_payments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  provider text not null default 'picpay',
  reference_id text not null unique,
  amount int not null,
  status text not null default 'pendente',     -- pendente | pago | expirado | cancelado | estornado
  payment_url text not null default '',
  qrcode text not null default '',
  days int not null default 30,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------- Operação do studio ----------
create table if not exists public.dn_services (
  id bigint generated by default as identity primary key,
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  price int not null default 0 check (price >= 0),
  duration int not null default 60 check (duration >= 5),
  photo text not null default '',
  active boolean not null default true,
  sort int not null default 0
);
create index if not exists dn_services_studio_idx on public.dn_services(studio_id);

create table if not exists public.dn_bookings (
  id bigint generated by default as identity primary key,
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  code text not null,
  access_token uuid not null default gen_random_uuid() unique,
  date date not null,
  start_at text not null check (start_at ~ '^\d\d:\d\d$'),
  end_at text not null check (end_at ~ '^\d\d:\d\d$'),
  services jsonb not null default '[]',
  total int not null default 0,
  duration int not null default 0,
  client_name text not null,
  client_phone text not null,
  notes text not null default '',
  status text not null default 'pendente' check (status in ('pendente','confirmado','concluido','faltou','cancelado')),
  source text not null default 'online',
  payment_method text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists dn_bookings_studio_date_idx on public.dn_bookings(studio_id, date);
create index if not exists dn_bookings_phone_idx on public.dn_bookings(studio_id, client_phone);

create table if not exists public.dn_blocks (
  id bigint generated by default as identity primary key,
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  date date not null,
  start_at text not null default '',
  end_at text not null default '',
  reason text not null default ''
);
create index if not exists dn_blocks_studio_date_idx on public.dn_blocks(studio_id, date);

create table if not exists public.dn_finance (
  id bigint generated by default as identity primary key,
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  kind text not null check (kind in ('entrada','saida')),
  category text not null default '',
  description text not null default '',
  amount int not null check (amount >= 0),
  date date not null default current_date,
  method text not null default '',
  booking_id bigint unique references public.dn_bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dn_finance_studio_date_idx on public.dn_finance(studio_id, date);

create table if not exists public.dn_messages (
  id bigint generated by default as identity primary key,
  studio_id uuid not null references public.dn_studios(id) on delete cascade,
  booking_id bigint references public.dn_bookings(id) on delete cascade,
  kind text not null check (kind in ('confirmacao','lembrete','manual','teste')),
  to_phone text not null,
  body text not null,
  send_after timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro','cancelado')),
  attempts int not null default 0,
  last_error text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dn_messages_due_idx on public.dn_messages(status, send_after);

-- ---------- Funções utilitárias ----------
create or replace function public.dn_tmin(t text) returns int language sql immutable set search_path = public as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int $$;
create or replace function public.dn_ttxt(m int) returns text language sql immutable set search_path = public as $$
  select lpad((m / 60)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0') $$;
create or replace function public.dn_local_now() returns timestamp language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo') $$;
create or replace function public.dn_phone(p text) returns text language sql immutable set search_path = public as $$
  select case when length(d) in (10, 11) then '55' || d else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x $$;
create or replace function public.dn_brl(c int) returns text language sql immutable set search_path = public as $$
  select 'R$ ' || replace(replace(replace(to_char(c / 100.0, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') $$;
create or replace function public.dn_date_br(d date) returns text language sql immutable set search_path = public as $$
  select (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from d)::int + 1]
         || ', ' || to_char(d, 'DD/MM') $$;

create or replace function public.dn_is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dn_superadmins where user_id = auth.uid()) $$;

create or replace function public.dn_owns(p_studio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dn_studios where id = p_studio and owner_id = auth.uid()) or dn_is_superadmin() $$;

create or replace function public.dn_studio_active(p_studio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dn_subscriptions s where s.studio_id = p_studio and s.status <> 'cancelada'
    and greatest(coalesce(s.trial_ends_at, '-infinity'), coalesce(s.paid_until, '-infinity')) > now()) $$;

create or replace function public.dn_site_url() returns text
language sql stable security definer set search_path = public as $$ select site_url from dn_platform where id = 1 $$;

-- ---------- Horários livres ----------
create or replace function public.dn_slots_for(p_studio uuid, p_date date, p_duration int, p_ignore bigint default null, p_admin boolean default false)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  s dn_studios; h jsonb; o int; c int; t int; busy int4range[] := '{}'; b int4range; r record;
  min_ts timestamp; res text[] := '{}'; ok boolean;
begin
  if p_admin and not dn_owns(p_studio) then p_admin := false; end if;
  if not p_admin then p_ignore := null; end if;
  p_duration := greatest(5, coalesce(p_duration, 60));
  select * into s from dn_studios where id = p_studio;
  if not found then return res; end if;
  h := s.hours -> (extract(dow from p_date)::int)::text;
  if h is null or jsonb_typeof(h) <> 'array' or coalesce(h->>0, '') !~ '^\d\d:\d\d$' or coalesce(h->>1, '') !~ '^\d\d:\d\d$' then
    return res;
  end if;
  o := dn_tmin(h->>0); c := dn_tmin(h->>1);
  if coalesce(s.break_time->>0, '') ~ '^\d\d:\d\d$' and coalesce(s.break_time->>1, '') ~ '^\d\d:\d\d$'
     and dn_tmin(s.break_time->>1) > dn_tmin(s.break_time->>0) then
    busy := busy || int4range(dn_tmin(s.break_time->>0), dn_tmin(s.break_time->>1));
  end if;
  for r in select start_at, end_at from dn_bookings
           where studio_id = p_studio and date = p_date and status <> 'cancelado' and (p_ignore is null or id <> p_ignore) loop
    if dn_tmin(r.end_at) > dn_tmin(r.start_at) then busy := busy || int4range(dn_tmin(r.start_at), dn_tmin(r.end_at)); end if;
  end loop;
  for r in select start_at, end_at from dn_blocks where studio_id = p_studio and date = p_date loop
    if r.start_at = '' or r.end_at = '' then return '{}'; end if;
    busy := busy || int4range(dn_tmin(r.start_at), dn_tmin(r.end_at));
  end loop;
  min_ts := dn_local_now() + make_interval(hours => case when p_admin then 0 else s.min_advance_hours end);
  t := o;
  while t + p_duration <= c loop
    if p_date + make_interval(mins => t) >= min_ts then
      ok := true;
      foreach b in array busy loop
        if b && int4range(t, t + p_duration) then ok := false; exit; end if;
      end loop;
      if ok then res := res || dn_ttxt(t); end if;
    end if;
    t := t + s.step;
  end loop;
  return res;
end $$;

create or replace function public.dn_studio_by_slug(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from dn_studios where slug = lower(btrim(p_slug)) $$;

-- ---------- API pública (página de agendamento) ----------
create or replace function public.dn_public_studio(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s dn_studios;
begin
  select * into s from dn_studios where slug = lower(btrim(p_slug));
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object(
    'active', dn_studio_active(s.id),
    'studio', jsonb_build_object('slug', s.slug, 'name', s.name, 'tagline', s.tagline, 'logo_url', s.logo_url,
       'show_name', s.show_name, 'name_style', s.name_style, 'theme', s.theme, 'segment', s.segment,
       'whatsapp', s.whatsapp, 'instagram', s.instagram, 'address', s.address, 'maps_url', s.maps_url,
       'hours', s.hours, 'policy', s.policy, 'deposit_text', s.deposit_text, 'tpl_booking', s.tpl_booking,
       'max_days_ahead', s.max_days_ahead, 'cancel_min_hours', s.cancel_min_hours, 'wa_auto', s.wa_status = 'conectado' and s.wa_send_confirm),
    'services', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort, x.id) from
        (select id, name, description, category, price, duration, photo, sort from dn_services where studio_id = s.id and active) x), '[]'),
    'today', to_char(dn_local_now(), 'YYYY-MM-DD'));
end $$;

create or replace function public.dn_availability(p_slug text, p_duration int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid; n int; i int; d date; out jsonb := '{}';
begin
  sid := dn_studio_by_slug(p_slug);
  if sid is null or not dn_studio_active(sid) then return out; end if;
  select max_days_ahead into n from dn_studios where id = sid;
  for i in 0..least(n, 120) loop
    d := dn_local_now()::date + i;
    out := out || jsonb_build_object(d::text, coalesce(array_length(dn_slots_for(sid, d, p_duration), 1), 0));
  end loop;
  return out;
end $$;

create or replace function public.dn_slots(p_slug text, p_date date, p_duration int) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare sid uuid;
begin
  sid := dn_studio_by_slug(p_slug);
  if sid is null or not dn_studio_active(sid) then return '{}'; end if;
  return dn_slots_for(sid, p_date, p_duration);
end $$;

-- núcleo da reserva (usado pela cliente e pela dona)
create or replace function public.dn_book_core(p_studio uuid, p_services bigint[], p_date date, p_start text, p_name text, p_phone text,
  p_notes text, p_force boolean, p_admin boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s dn_studios; svcs jsonb; dur int; tot int; ph text; nm text; cnt int; rec dn_bookings;
begin
  select * into s from dn_studios where id = p_studio;
  if not found then raise exception 'Studio não encontrado.'; end if;
  nm := left(btrim(coalesce(p_name, '')), 80);
  ph := dn_phone(p_phone);
  if length(nm) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(ph) < 12 or length(ph) > 15 then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
  if p_start !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Horário inválido.'; end if;

  select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price) order by sort, id), sum(duration), sum(price), count(*)
    into svcs, dur, tot, cnt
    from dn_services where studio_id = p_studio and id = any(p_services) and (active or p_admin);
  if cnt is null or cnt = 0 or cnt <> (select count(distinct x) from unnest(p_services) x) then
    raise exception 'Escolha serviços válidos.';
  end if;

  if not p_admin then
    if not dn_studio_active(p_studio) then raise exception 'A agenda deste studio está indisponível no momento.'; end if;
    if p_date > dn_local_now()::date + s.max_days_ahead then raise exception 'Data fora do período de agendamento.'; end if;
    if (select count(*) from dn_bookings where studio_id = p_studio and client_phone = ph and created_at > now() - interval '1 hour') >= 4 then
      raise exception 'Muitos agendamentos seguidos. Fale com o studio pelo WhatsApp.';
    end if;
    if (select count(*) from dn_bookings where studio_id = p_studio and source = 'online' and created_at > now() - interval '1 hour') >= 40 then
      raise exception 'Agenda temporariamente ocupada. Tente novamente em alguns minutos.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('dn-' || p_studio::text || p_date::text));
  if not (p_admin and p_force) and not (p_start = any(dn_slots_for(p_studio, p_date, dur, null, p_admin))) then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.' using errcode = 'RA409';
  end if;

  insert into dn_bookings(studio_id, code, date, start_at, end_at, services, total, duration, client_name, client_phone, notes, status, source)
  values (p_studio, upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5)), p_date, p_start,
          dn_ttxt(dn_tmin(p_start) + dur), svcs, tot, dur, nm, ph, left(coalesce(p_notes, ''), 500),
          case when p_admin or s.auto_confirm then 'confirmado' else 'pendente' end,
          case when p_admin then 'manual' else 'online' end)
  returning * into rec;
  return to_jsonb(rec);
end $$;

create or replace function public.dn_book(p_slug text, p_services bigint[], p_date date, p_start text, p_name text, p_phone text, p_notes text default '')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare sid uuid;
begin
  sid := dn_studio_by_slug(p_slug);
  if sid is null then raise exception 'Studio não encontrado.'; end if;
  return dn_book_core(sid, p_services, p_date, p_start, p_name, p_phone, p_notes, false, false);
end $$;

create or replace function public.dn_admin_book(p_studio uuid, p_services bigint[], p_date date, p_start text, p_name text, p_phone text,
  p_notes text default '', p_force boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not dn_owns(p_studio) then raise exception 'Não autorizado'; end if;
  return dn_book_core(p_studio, p_services, p_date, p_start, p_name, p_phone, p_notes, p_force, true);
end $$;

-- ---------- Área da cliente ----------
create or replace function public.dn_client_bookings(p_slug text, p_token uuid default null, p_name text default null, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s dn_studios; ph text; first text; bk dn_bookings;
begin
  select * into s from dn_studios where slug = lower(btrim(p_slug));
  if not found then return jsonb_build_object('error', 'Studio não encontrado.'); end if;
  if p_token is not null then
    select * into bk from dn_bookings where access_token = p_token and studio_id = s.id;
    if not found then return jsonb_build_object('error', 'Link inválido ou expirado.'); end if;
    ph := bk.client_phone;
  else
    ph := dn_phone(p_phone);
    first := lower(extensions.unaccent(split_part(btrim(coalesce(p_name, '')), ' ', 1)));
    if length(ph) < 12 or length(first) < 2 then return jsonb_build_object('error', 'Informe seu nome e WhatsApp.'); end if;
    if not exists (select 1 from dn_bookings where studio_id = s.id and client_phone = ph
                   and lower(extensions.unaccent(split_part(client_name, ' ', 1))) = first) then
      return jsonb_build_object('bookings', '[]'::jsonb);
    end if;
  end if;
  return jsonb_build_object('bookings', coalesce((select jsonb_agg(jsonb_build_object(
      'token', access_token, 'code', code, 'date', date, 'start', start_at, 'end', end_at, 'services', services,
      'total', total, 'status', status, 'client_name', client_name,
      'can_cancel', status in ('pendente','confirmado') and (date + start_at::time) > dn_local_now() + make_interval(hours => s.cancel_min_hours))
    order by date desc, start_at desc) from dn_bookings where studio_id = s.id and client_phone = ph), '[]'));
end $$;

create or replace function public.dn_client_cancel(p_token uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare bk dn_bookings; s dn_studios;
begin
  select * into bk from dn_bookings where access_token = p_token for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  select * into s from dn_studios where id = bk.studio_id;
  if bk.status not in ('pendente','confirmado') then raise exception 'Este agendamento não pode mais ser cancelado.'; end if;
  if (bk.date + bk.start_at::time) <= dn_local_now() + make_interval(hours => s.cancel_min_hours) then
    raise exception 'Cancelamento online só até % horas antes. Fale com o studio pelo WhatsApp.', s.cancel_min_hours;
  end if;
  update dn_bookings set status = 'cancelado', notes = trim(notes || ' [cancelado pela cliente]') where id = bk.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Painel ----------
create or replace function public.dn_create_studio(p_name text, p_slug text, p_whatsapp text default '', p_segment text default 'Nail design')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare sid uuid; v_slug text; pf dn_platform;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if exists (select 1 from dn_studios where owner_id = auth.uid()) then raise exception 'Você já tem um studio cadastrado.'; end if;
  v_slug := lower(regexp_replace(extensions.unaccent(btrim(coalesce(p_slug, ''))), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then raise exception 'Endereço inválido. Use letras, números e hífen (3 a 40).'; end if;
  if v_slug in ('agendar','painel','saas','assets','minha-agenda','api','admin','www','app','login') then raise exception 'Esse endereço é reservado. Escolha outro.'; end if;
  if exists (select 1 from dn_studios where dn_studios.slug = v_slug) then raise exception 'Esse endereço já está em uso. Escolha outro.'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome do studio.'; end if;
  select * into pf from dn_platform where id = 1;
  insert into dn_studios(owner_id, slug, name, whatsapp, segment) values (auth.uid(), v_slug, btrim(p_name), dn_phone(p_whatsapp), coalesce(nullif(btrim(p_segment), ''), 'Nail design'))
  returning id into sid;
  insert into dn_subscriptions(studio_id, status, trial_ends_at, plan_price) values (sid, 'trial', now() + make_interval(days => pf.trial_days), pf.plan_price);
  insert into dn_services(studio_id, name, description, category, price, duration, sort) values
    (sid, 'Esmaltação em gel', 'Cor com brilho e durabilidade.', 'Mãos', 6000, 60, 0),
    (sid, 'Alongamento em fibra', 'Formato e comprimento sob medida.', 'Alongamento', 17000, 150, 1),
    (sid, 'Manutenção', 'Para quem já tem alongamento.', 'Alongamento', 10000, 120, 2),
    (sid, 'Pedicure', 'Cutilagem, lixamento e esmaltação.', 'Pés', 4500, 50, 3);
  return jsonb_build_object('id', sid, 'slug', v_slug);
end $$;

create or replace function public.dn_my_studio() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when s.id is null then null else jsonb_build_object(
    'studio', to_jsonb(s),
    'subscription', (select to_jsonb(x) from dn_subscriptions x where x.studio_id = s.id),
    'active', dn_studio_active(s.id),
    'platform', (select jsonb_build_object('saas_name', saas_name, 'site_url', site_url, 'plan_name', plan_name, 'plan_price', plan_price, 'support_whatsapp', support_whatsapp) from dn_platform where id = 1),
    'is_superadmin', dn_is_superadmin())
  end
  from (select 1) one left join dn_studios s on s.owner_id = auth.uid() $$;

create or replace function public.dn_admin_clients(p_studio uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not dn_owns(p_studio) then raise exception 'Não autorizado'; end if;
  return coalesce((select jsonb_agg(x order by x.last_date desc) from (
    select client_phone as phone, (array_agg(client_name order by date desc, start_at desc))[1] as name,
      count(*) as visits, coalesce(sum(total) filter (where status = 'concluido'), 0) as spent,
      count(*) filter (where status = 'faltou') as noshows,
      max(date) filter (where status = 'concluido') as last_visit,
      min(date::text || ' ' || start_at) filter (where date >= dn_local_now()::date and status in ('pendente','confirmado')) as next_visit,
      max(date) as last_date
    from dn_bookings where studio_id = p_studio group by client_phone) x), '[]');
end $$;

create or replace function public.dn_admin_stats(p_studio uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare by_status jsonb; top jsonb;
begin
  if not dn_owns(p_studio) then raise exception 'Não autorizado'; end if;
  select coalesce(jsonb_object_agg(status, jsonb_build_object('n', n, 't', t)), '{}') into by_status
    from (select status, count(*) n, coalesce(sum(total), 0) t from dn_bookings where studio_id = p_studio and date between p_from and p_to group by status) a;
  select coalesce(jsonb_object_agg(name, n), '{}') into top from (
    select e->>'name' as name, count(*) n from dn_bookings, jsonb_array_elements(services) e
    where studio_id = p_studio and date between p_from and p_to and status in ('pendente','confirmado','concluido')
    group by 1 order by 2 desc limit 5) b;
  return jsonb_build_object('by_status', by_status, 'top_services', top);
end $$;

-- ---------- Mensagens e financeiro automáticos ----------
create or replace function public.dn_render(tpl text, b dn_bookings, s dn_studios) returns text
language plpgsql stable security definer set search_path = public as $$
declare site text := coalesce(nullif(dn_site_url(), ''), '');
begin
  return replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(tpl,
    '{nome}', split_part(b.client_name, ' ', 1)),
    '{servicos}', coalesce((select string_agg(e->>'name', ' + ') from jsonb_array_elements(b.services) e), '')),
    '{data}', dn_date_br(b.date)),
    '{hora}', b.start_at),
    '{valor}', dn_brl(b.total)),
    '{codigo}', b.code),
    '{studio}', s.name),
    '{endereco}', coalesce(nullif(s.address, ''), '—')),
    '{link}', site || '/minha-agenda/?s=' || s.slug || '&t=' || b.access_token::text),
    '{agendar}', site || '/' || s.slug),
    '{antecedencia}', case when s.wa_reminder_minutes % 60 = 0 then (s.wa_reminder_minutes / 60)::text || case when s.wa_reminder_minutes = 60 then ' hora' else ' horas' end
                           else s.wa_reminder_minutes::text || ' minutos' end);
end $$;

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
    return new;
  end if;

  -- cancelou / faltou: cancela lembretes pendentes
  if new.status in ('cancelado','faltou') and old.status not in ('cancelado','faltou') then
    update dn_messages set status = 'cancelado' where booking_id = new.id and status = 'pendente';
  end if;
  -- remarcou: reagenda o lembrete
  if (new.date, new.start_at) is distinct from (old.date, old.start_at) and new.status in ('pendente','confirmado') then
    update dn_messages set status = 'cancelado' where booking_id = new.id and kind = 'lembrete' and status = 'pendente';
    if s.wa_send_reminder and v_at - make_interval(mins => s.wa_reminder_minutes) > now() then
      insert into dn_messages(studio_id, booking_id, kind, to_phone, body, send_after)
      values (s.id, new.id, 'lembrete', new.client_phone, dn_render(s.tpl_reminder, new, s), v_at - make_interval(mins => s.wa_reminder_minutes));
    end if;
  end if;
  -- concluiu: lança entrada no financeiro
  if new.status = 'concluido' and old.status <> 'concluido' and new.total > 0 then
    insert into dn_finance(studio_id, kind, category, description, amount, date, method, booking_id)
    values (new.studio_id, 'entrada', 'Atendimentos',
            new.client_name || ' — ' || coalesce((select string_agg(e->>'name', ' + ') from jsonb_array_elements(new.services) e), ''),
            new.total, new.date, new.payment_method, new.id)
    on conflict (booking_id) do update set amount = excluded.amount, date = excluded.date, method = excluded.method;
  end if;
  -- desfez a conclusão: remove a entrada automática
  if old.status = 'concluido' and new.status <> 'concluido' then
    delete from dn_finance where booking_id = new.id;
  end if;
  -- valor alterado depois de concluído
  if new.status = 'concluido' and old.status = 'concluido' and new.total <> old.total then
    update dn_finance set amount = new.total where booking_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists dn_bookings_after_ins on public.dn_bookings;
create trigger dn_bookings_after_ins after insert on public.dn_bookings for each row execute function public.dn_bookings_after();
drop trigger if exists dn_bookings_after_upd on public.dn_bookings;
create trigger dn_bookings_after_upd after update on public.dn_bookings for each row execute function public.dn_bookings_after();

-- fila para o despachante (Edge Function)
create or replace function public.dn_claim_messages(p_secret text, p_limit int default 30)
returns table (id bigint, studio_id uuid, kind text, to_phone text, body text, wa_instance text, wa_status text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_secret is distinct from (select v from dn_private.config where k = 'cron_secret') then raise exception 'forbidden'; end if;
  -- lembretes atrasados demais perdem o sentido
  update dn_messages m set status = 'cancelado', last_error = 'expirado'
   where m.status = 'pendente' and m.kind = 'lembrete'
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

create or replace function public.dn_finish_message(p_secret text, p_id bigint, p_ok boolean, p_error text default '')
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_secret is distinct from (select v from dn_private.config where k = 'cron_secret') then raise exception 'forbidden'; end if;
  update dn_messages set status = case when p_ok then 'enviado' else 'erro' end,
         sent_at = case when p_ok then now() else sent_at end, last_error = left(coalesce(p_error, ''), 500)
   where id = p_id;
end $$;

-- ---------- Assinatura ----------
create or replace function public.dn_apply_payment(p_secret text, p_reference text, p_raw jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p dn_payments; sub dn_subscriptions; base timestamptz;
begin
  if p_secret is distinct from (select v from dn_private.config where k = 'cron_secret') then raise exception 'forbidden'; end if;
  select * into p from dn_payments where reference_id = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'pagamento não encontrado'); end if;
  if p.status = 'pago' then return jsonb_build_object('ok', true, 'already', true); end if;
  update dn_payments set status = 'pago', paid_at = now(), raw = coalesce(p_raw, raw) where id = p.id;
  select * into sub from dn_subscriptions where studio_id = p.studio_id for update;
  base := greatest(now(), coalesce(sub.paid_until, now()), case when sub.status = 'trial' then coalesce(sub.trial_ends_at, now()) else now() end);
  update dn_subscriptions set status = 'ativa', paid_until = base + make_interval(days => p.days), updated_at = now() where studio_id = p.studio_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dn_sa_extend(p_studio uuid, p_days int) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not dn_is_superadmin() then raise exception 'Não autorizado'; end if;
  update dn_subscriptions set status = 'ativa',
    paid_until = greatest(now(), coalesce(paid_until, now())) + make_interval(days => p_days), updated_at = now()
  where studio_id = p_studio;
end $$;

create or replace function public.dn_sa_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not dn_is_superadmin() then raise exception 'Não autorizado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'whatsapp', s.whatsapp, 'created_at', s.created_at,
      'email', (select email from auth.users u where u.id = s.owner_id),
      'status', sub.status, 'trial_ends_at', sub.trial_ends_at, 'paid_until', sub.paid_until, 'active', dn_studio_active(s.id),
      'bookings_30d', (select count(*) from dn_bookings b where b.studio_id = s.id and b.created_at > now() - interval '30 days'),
      'wa_status', s.wa_status) order by s.created_at desc)
    from dn_studios s left join dn_subscriptions sub on sub.studio_id = s.id), '[]');
end $$;

-- ---------- RLS ----------
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename like 'dn\_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in select policyname from pg_policies where schemaname = 'storage' and policyname like 'dn media%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
alter table public.dn_platform enable row level security;
alter table public.dn_superadmins enable row level security;
alter table public.dn_studios enable row level security;
alter table public.dn_subscriptions enable row level security;
alter table public.dn_payments enable row level security;
alter table public.dn_services enable row level security;
alter table public.dn_bookings enable row level security;
alter table public.dn_blocks enable row level security;
alter table public.dn_finance enable row level security;
alter table public.dn_messages enable row level security;

create policy "dn platform leitura" on public.dn_platform for select to anon, authenticated using (true);
create policy "dn platform superadmin" on public.dn_platform for update to authenticated using (dn_is_superadmin()) with check (dn_is_superadmin());
create policy "dn superadmins proprio" on public.dn_superadmins for select to authenticated using (user_id = auth.uid());

create policy "dn studios dono le" on public.dn_studios for select to authenticated using (owner_id = auth.uid() or dn_is_superadmin());
create policy "dn studios dono edita" on public.dn_studios for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "dn subs dono le" on public.dn_subscriptions for select to authenticated using (dn_owns(studio_id));
create policy "dn subs superadmin" on public.dn_subscriptions for update to authenticated using (dn_is_superadmin()) with check (dn_is_superadmin());
create policy "dn payments dono le" on public.dn_payments for select to authenticated using (dn_owns(studio_id));

create policy "dn services dono" on public.dn_services for all to authenticated using (dn_owns(studio_id)) with check (dn_owns(studio_id));
create policy "dn bookings dono" on public.dn_bookings for all to authenticated using (dn_owns(studio_id)) with check (dn_owns(studio_id));
create policy "dn blocks dono" on public.dn_blocks for all to authenticated using (dn_owns(studio_id)) with check (dn_owns(studio_id));
create policy "dn finance dono" on public.dn_finance for all to authenticated using (dn_owns(studio_id)) with check (dn_owns(studio_id));
create policy "dn messages dono le" on public.dn_messages for select to authenticated using (dn_owns(studio_id));
create policy "dn messages dono cria" on public.dn_messages for insert to authenticated with check (dn_owns(studio_id) and kind in ('manual','teste'));
create policy "dn messages dono cancela" on public.dn_messages for update to authenticated using (dn_owns(studio_id)) with check (dn_owns(studio_id));

-- colunas que a dona não pode alterar diretamente
revoke update on public.dn_studios from authenticated;
grant update (name, tagline, logo_url, show_name, name_style, theme, segment, whatsapp, instagram, address, maps_url, hours, break_time,
  step, min_advance_hours, max_days_ahead, cancel_min_hours, auto_confirm, deposit_text, policy,
  wa_send_confirm, wa_send_reminder, wa_reminder_minutes, tpl_booking, tpl_confirm, tpl_reminder, tpl_thanks) on public.dn_studios to authenticated;

-- anon não acessa tabelas diretamente (só pelas funções públicas)
revoke all on public.dn_studios, public.dn_subscriptions, public.dn_payments, public.dn_services, public.dn_bookings,
  public.dn_blocks, public.dn_finance, public.dn_messages, public.dn_superadmins from anon;

-- funções internas
revoke execute on function public.dn_slots_for(uuid, date, int, bigint, boolean) from public, anon;
revoke execute on function public.dn_book_core(uuid, bigint[], date, text, text, text, text, boolean, boolean),
  public.dn_render(text, dn_bookings, dn_studios), public.dn_bookings_after() from public, anon, authenticated;
revoke execute on function public.dn_admin_clients(uuid), public.dn_admin_stats(uuid, date, date), public.dn_admin_book(uuid, bigint[], date, text, text, text, text, boolean),
  public.dn_create_studio(text, text, text, text), public.dn_my_studio(), public.dn_sa_extend(uuid, int), public.dn_sa_overview() from public, anon;
grant execute on function public.dn_slots_for(uuid, date, int, bigint, boolean) to authenticated;

-- ---------- Storage (logos e fotos de serviços) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dn-media', 'dn-media', true, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "dn admin envia fotos" on storage.objects;
drop policy if exists "dn admin altera fotos" on storage.objects;
drop policy if exists "dn admin apaga fotos" on storage.objects;
-- arquivos ficam em <studio_id>/arquivo.ext
create policy "dn media envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'dn-media' and public.dn_owns(((storage.foldername(name))[1])::uuid));
create policy "dn media altera" on storage.objects for update to authenticated
  using (bucket_id = 'dn-media' and public.dn_owns(((storage.foldername(name))[1])::uuid));
create policy "dn media apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'dn-media' and public.dn_owns(((storage.foldername(name))[1])::uuid));
