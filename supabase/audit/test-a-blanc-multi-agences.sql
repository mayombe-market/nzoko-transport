-- TEST À BLANC — multi-agences et paiements (tout est annulé à la fin)
do $test$
declare
  f record; r text := ''; a uuid; j jsonb; jb jsonb; jc jsonb; v_trip uuid; v_trip_r uuid; b1 uuid; b2 uuid; n int; avant text;
begin
  a := (select id from public.agent_profiles where role = 'admin' limit 1);
  avant := (select count(*) from public.bookings)::text || '/' || (select count(*) from public.payments)::text || '/' || (select count(*) from public.parcels)::text;

  -- ==================== MIGRATION ====================


-- ------------------------------------------------------------
-- 1. Agences principales
-- ------------------------------------------------------------
alter table public.terminals add column if not exists is_main boolean not null default false;
update public.terminals set is_main = true
where id in (select distinct on (city_id) id from public.terminals where is_active order by city_id, created_at, id)
  and not exists (select 1 from public.terminals t2 where t2.city_id = terminals.city_id and t2.is_main);

-- ------------------------------------------------------------
-- 2. Comptes de paiement par agence
-- ------------------------------------------------------------
create table if not exists public.agency_payment_accounts (
  id          uuid primary key default gen_random_uuid(),
  terminal_id text not null references public.terminals(id),
  provider    text not null check (provider in ('mtn', 'airtel')),
  number      text not null,
  holder_name text not null,
  is_active   boolean not null default true,
  updated_by  uuid references public.agent_profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists agency_payment_accounts_terminal_idx on public.agency_payment_accounts (terminal_id, provider);

create table if not exists public.agency_payment_account_changes (
  id          bigserial primary key,
  account_id  uuid not null references public.agency_payment_accounts(id) on delete cascade,
  changed_by  uuid references public.agent_profiles(id) on delete set null,
  before      jsonb,
  after       jsonb not null,
  changed_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Paiements : agence bénéficiaire + compte utilisé
-- ------------------------------------------------------------
alter table public.payments
  add column if not exists agency_id text references public.terminals(id),
  add column if not exists account_id uuid references public.agency_payment_accounts(id) on delete set null;
update public.payments p set agency_id = b.from_terminal
from public.bookings b where b.id = p.booking_id and p.agency_id is null and b.from_terminal is not null;
create index if not exists payments_agency_status_idx on public.payments (agency_id, status);

-- ------------------------------------------------------------
-- 4. Références de transaction uniques (voyageurs et colis)
-- ------------------------------------------------------------
create or replace function public.nzk_norm_tx(p text)
returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create table if not exists public.transaction_references (
  provider   text not null check (provider in ('mtn', 'airtel')),
  code_norm  text not null,
  source     text not null,
  source_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (provider, code_norm)
);
insert into public.transaction_references (provider, code_norm, source, source_id)
select p.method, public.nzk_norm_tx(p.transaction_code), 'booking', p.booking_id
from public.payments p
where p.method in ('mtn', 'airtel') and p.status in ('pending', 'confirmed') and length(public.nzk_norm_tx(p.transaction_code)) >= 4
on conflict do nothing;
insert into public.transaction_references (provider, code_norm, source, source_id)
select pp.method, public.nzk_norm_tx(pp.transaction_code), 'parcel', pp.parcel_id
from public.parcel_payments pp
where pp.method in ('mtn', 'airtel') and length(public.nzk_norm_tx(pp.transaction_code)) >= 4
on conflict do nothing;

alter table public.agency_payment_accounts        enable row level security;
alter table public.agency_payment_account_changes enable row level security;
alter table public.transaction_references         enable row level security;
revoke all on public.agency_payment_accounts, public.agency_payment_account_changes, public.transaction_references from anon, authenticated;
revoke all on sequence public.agency_payment_account_changes_id_seq from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Rôles et périmètre des agents
-- ------------------------------------------------------------
create or replace function public.is_active_agent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_profiles
                 where id = auth.uid() and is_active = true and role in ('admin', 'finance', 'manager', 'agent'));
$$;

create or replace function public.nzk_agent(p_agent uuid)
returns table (id uuid, role text, terminal_id text, city_id text)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.role, a.terminal_id, t.city_id
  from public.agent_profiles a left join public.terminals t on t.id = a.terminal_id
  where a.id = p_agent and a.is_active and a.role in ('admin', 'finance', 'manager', 'agent');
$$;

-- Central (admin / finance) : toutes les agences. Agent / responsable : uniquement la sienne.
create or replace function public.nzk_agent_covers(p_agent uuid, p_terminal text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.nzk_agent(p_agent) a
                 where a.role in ('admin', 'finance') or (a.terminal_id is not null and a.terminal_id = p_terminal));
$$;

-- Confirmer / refuser / annuler une réservation : agence qui reçoit l'argent (ou central)
create or replace function public.nzk_agent_can_handle(p_agent uuid, p_booking uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.nzk_agent_covers(p_agent, (
    select coalesce((select p.agency_id from public.payments p where p.booking_id = bk.id order by p.created_at desc limit 1), bk.from_terminal)
    from public.bookings bk where bk.id = p_booking));
$$;

-- Lecture (RLS) côté navigateur
create or replace function public.nzk_my_scope()
returns table (role text, terminal_id text)
language sql stable security definer set search_path = public as $$
  select role, terminal_id from public.agent_profiles
  where id = auth.uid() and is_active and role in ('admin', 'finance', 'manager', 'agent');
$$;

create or replace function public.nzk_can_see_booking(p_booking uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nzk_my_scope() s, public.bookings b
    where b.id = p_booking and (s.role in ('admin', 'finance') or s.terminal_id in (b.from_terminal, b.to_terminal)));
$$;

create or replace function public.nzk_can_see_payment_agency(p_agency text, p_booking uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nzk_my_scope() s
    where s.role in ('admin', 'finance')
       or s.terminal_id = coalesce(p_agency, (select from_terminal from public.bookings where id = p_booking)));
$$;

-- ------------------------------------------------------------
-- 6. Détermination des agences d'une réservation
-- ------------------------------------------------------------
-- Ville d'origine ou terminus d'un départ (selon le sens)
create or replace function public.nzk_trip_end_city(p_trip uuid, p_which text)
returns text language sql stable security definer set search_path = public as $$
  select z.city_id from public.trips tr
  join public.services sv on sv.id = tr.service_id
  join public.corridor_stops z on z.corridor_id = sv.corridor_id
  where tr.id = p_trip
  order by case when (tr.direction = 'aller') = (p_which = 'origine') then z.stop_order else -z.stop_order end
  limit 1;
$$;

-- Agence choisie si valide dans la ville, sinon agence principale de la ville, sinon celle de la ville de repli
create or replace function public.nzk_resolve_agency(p_city text, p_chosen text, p_fallback_city text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.terminals where id = p_chosen and city_id = p_city and is_active),
    (select id from public.terminals where city_id = p_city and is_active order by is_main desc, created_at, id limit 1),
    (select id from public.terminals where city_id = p_fallback_city and is_active order by is_main desc, created_at, id limit 1)
  );
$$;

-- Informations de paiement présentées au client pour ce départ
create or replace function public.nzk_trip_payment_info(p_trip uuid, p_from text, p_to text, p_from_terminal text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_agency text;
begin
  v_agency := public.nzk_resolve_agency(p_from, p_from_terminal, public.nzk_trip_end_city(p_trip, 'origine'));
  if v_agency is null then return null; end if;
  return jsonb_build_object(
    'agency_id', v_agency,
    'agency_name', (select name from public.terminals where id = v_agency),
    'agency_city', (select c.name from public.terminals t join public.cities c on c.id = t.city_id where t.id = v_agency),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('provider', a.provider, 'number', a.number, 'holder_name', a.holder_name) order by a.provider)
                          from (select distinct on (provider) * from public.agency_payment_accounts
                                where terminal_id = v_agency and is_active order by provider, updated_at desc) a), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------
-- 7. Comptes de paiement : lecture et modification (admin / finance uniquement)
-- ------------------------------------------------------------
create or replace function public.nzk_payment_accounts(p_agent uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'terminal_id', x.terminal_id, 'terminal_name', t.name, 'city', c.name, 'provider', x.provider,
      'number', x.number, 'holder_name', x.holder_name, 'is_active', x.is_active, 'updated_at', x.updated_at,
      'updated_by', (select full_name from public.agent_profiles where id = x.updated_by)) order by c.name, t.name, x.provider)
    from public.agency_payment_accounts x join public.terminals t on t.id = x.terminal_id join public.cities c on c.id = t.city_id
    where a.role in ('admin', 'finance') or x.terminal_id = a.terminal_id), '[]'::jsonb);
end $$;

create or replace function public.nzk_payment_account_save(p_agent uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_before jsonb; v_after jsonb;
begin
  if not exists (select 1 from public.nzk_agent(p_agent) where role in ('admin', 'finance')) then
    return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE');
  end if;
  if coalesce(p->>'provider', '') not in ('mtn', 'airtel') then return jsonb_build_object('ok', false, 'error', 'METHODE_INVALIDE'); end if;
  if not exists (select 1 from public.terminals where id = p->>'terminal_id') then return jsonb_build_object('ok', false, 'error', 'AGENCE_INVALIDE'); end if;
  if length(public.nzk_digits(p->>'number')) < 8 then return jsonb_build_object('ok', false, 'error', 'TELEPHONE_INVALIDE'); end if;
  if length(trim(coalesce(p->>'holder_name', ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'NOM_MANQUANT'); end if;

  if v_id is null then
    insert into public.agency_payment_accounts (terminal_id, provider, number, holder_name, is_active, updated_by)
    values (p->>'terminal_id', p->>'provider', trim(p->>'number'), trim(p->>'holder_name'), coalesce((p->>'is_active')::boolean, true), p_agent)
    returning id into v_id;
  else
    select to_jsonb(x) - 'updated_at' - 'updated_by' into v_before from public.agency_payment_accounts x where id = v_id;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
    update public.agency_payment_accounts set terminal_id = p->>'terminal_id', provider = p->>'provider', number = trim(p->>'number'),
           holder_name = trim(p->>'holder_name'), is_active = coalesce((p->>'is_active')::boolean, is_active),
           updated_by = p_agent, updated_at = now()
    where id = v_id;
  end if;
  select to_jsonb(x) - 'updated_at' - 'updated_by' into v_after from public.agency_payment_accounts x where id = v_id;
  insert into public.agency_payment_account_changes (account_id, changed_by, before, after) values (v_id, p_agent, v_before, v_after);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ------------------------------------------------------------
-- 8. Paiements voyageurs à vérifier (périmètre de l'agent)
-- ------------------------------------------------------------
create or replace function public.nzk_pending_payments(p_agent uuid, p_status text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  return coalesce((select jsonb_agg(s.d order by (s.d->>'declared_at') desc) from (
    select jsonb_build_object(
      'payment_id', p.id, 'booking_id', b.id, 'reference', b.reference, 'status', p.status, 'booking_status', b.status,
      'method', p.method, 'amount', p.amount, 'transaction_code', p.transaction_code, 'phone_sender', p.phone_sender,
      'declared_at', p.created_at, 'confirmed_at', p.confirmed_at,
      'confirmed_by', (select full_name from public.agent_profiles where id = p.confirmed_by),
      'agency_id', coalesce(p.agency_id, b.from_terminal),
      'agency_name', (select name from public.terminals where id = coalesce(p.agency_id, b.from_terminal)),
      'account_number', (select number from public.agency_payment_accounts where id = p.account_id),
      'from_city', (select name from public.cities where id = b.from_city), 'to_city', (select name from public.cities where id = b.to_city),
      'date', b.date, 'departure_time', b.departure_time, 'passenger_count', b.passenger_count,
      'customer_phone', b.customer_phone,
      'primary_passenger', (select full_name from public.passengers where booking_id = b.id order by is_primary desc limit 1)) as d
    from public.payments p join public.bookings b on b.id = p.booking_id
    where (p_status is null or p.status = p_status)
      and (a.role in ('admin', 'finance') or coalesce(p.agency_id, b.from_terminal) = a.terminal_id)
    order by p.created_at desc limit 200) s), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------
-- 9. Rapport financier par agence (central : tout le réseau ; responsable : son agence)
-- ------------------------------------------------------------
create or replace function public.nzk_finance_report(p_agent uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found or a.role not in ('admin', 'finance', 'manager') then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  return jsonb_build_object('ok', true, 'scope', case when a.role in ('admin', 'finance') then 'reseau' else 'agence' end, 'agencies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'agency_id', t.id, 'agency_name', t.name, 'city', c.name,
      'voyageurs', coalesce(v.total, 0), 'voyageurs_mtn', coalesce(v.mtn, 0), 'voyageurs_airtel', coalesce(v.airtel, 0), 'voyageurs_count', coalesce(v.n, 0),
      'colis', coalesce(k.total, 0), 'colis_mtn', coalesce(k.mtn, 0), 'colis_airtel', coalesce(k.airtel, 0), 'colis_especes', coalesce(k.especes, 0), 'colis_count', coalesce(k.n, 0),
      'en_attente_count', coalesce(w.n, 0), 'en_attente_montant', coalesce(w.total, 0)
    ) order by c.name, t.name)
    from public.terminals t join public.cities c on c.id = t.city_id
    left join lateral (
      select sum(p.amount) total, sum(p.amount) filter (where p.method = 'mtn') mtn, sum(p.amount) filter (where p.method = 'airtel') airtel, count(*) n
      from public.payments p join public.bookings b on b.id = p.booking_id
      where coalesce(p.agency_id, b.from_terminal) = t.id and p.status = 'confirmed'
        and (p.confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to) v on true
    left join lateral (
      select sum(pp.amount) total, sum(pp.amount) filter (where pp.method = 'mtn') mtn, sum(pp.amount) filter (where pp.method = 'airtel') airtel,
             sum(pp.amount) filter (where pp.method = 'especes') especes, count(*) n
      from public.parcel_payments pp
      where pp.terminal_id = t.id and pp.status = 'confirmed'
        and (pp.collected_at at time zone 'Africa/Brazzaville')::date between p_from and p_to) k on true
    left join lateral (
      select sum(p.amount) total, count(*) n
      from public.payments p join public.bookings b on b.id = p.booking_id
      where coalesce(p.agency_id, b.from_terminal) = t.id and p.status = 'pending') w on true
    where a.role in ('admin', 'finance') or t.id = a.terminal_id), '[]'::jsonb),
    'non_attribues', case when a.role in ('admin', 'finance') then jsonb_build_object(
      'voyageurs', coalesce((select sum(p.amount) from public.payments p join public.bookings b on b.id = p.booking_id
                             where coalesce(p.agency_id, b.from_terminal) is null and p.status = 'confirmed'
                               and (p.confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
      'en_attente_count', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
                           where coalesce(p.agency_id, b.from_terminal) is null and p.status = 'pending')) else null end);
end $$;

-- ------------------------------------------------------------
-- 10. Fonctions existantes adaptées (agence bénéficiaire, références uniques)
-- ------------------------------------------------------------
create or replace function public.nzk_create_booking(
  p_trip uuid, p_from text, p_to text, p_from_terminal text, p_to_terminal text, p_token text,
  p_passengers jsonb, p_customer_phone text, p_customer_email text,
  p_method text, p_transaction_code text, p_phone_sender text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  d jsonb; v_seats text[]; v_held int; v_count int; v_premium int; v_price int; v_unit int;
  v_booking uuid := gen_random_uuid(); v_ref text; v_key text := encode(gen_random_bytes(16), 'hex');
  v_board timestamp; p jsonb; i int := 0;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_account uuid; v_agency_name text; v_tx_norm text;
begin
  -- Contrôles des saisies
  if jsonb_typeof(p_passengers) <> 'array' then return jsonb_build_object('ok', false, 'error', 'PASSAGERS_INVALIDES'); end if;
  v_count := jsonb_array_length(p_passengers);
  if v_count < 1 or v_count > 10 then return jsonb_build_object('ok', false, 'error', 'PASSAGERS_INVALIDES'); end if;
  if p_method not in ('mtn', 'airtel') then return jsonb_build_object('ok', false, 'error', 'METHODE_INVALIDE'); end if;
  if coalesce(length(trim(p_transaction_code)), 0) not between 4 and 60 then return jsonb_build_object('ok', false, 'error', 'CODE_TRANSACTION_INVALIDE'); end if;
  if coalesce(length(regexp_replace(p_phone_sender, '\D', '', 'g')), 0) < 8 then return jsonb_build_object('ok', false, 'error', 'TELEPHONE_INVALIDE'); end if;
  for p in select * from jsonb_array_elements(p_passengers) loop
    if coalesce(length(trim(p->>'full_name')), 0) < 2 then return jsonb_build_object('ok', false, 'error', 'NOM_PASSAGER_MANQUANT'); end if;
  end loop;
  select array_agg(x->>'seat') into v_seats from jsonb_array_elements(p_passengers) x;
  if (select count(distinct s) from unnest(v_seats) s) <> v_count then return jsonb_build_object('ok', false, 'error', 'SIEGES_INVALIDES'); end if;

  d := public.nzk_trip_detail(p_trip, p_from, p_to);
  if d is null or (d->>'price') is null or d->>'status' <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'DEPART_INDISPONIBLE');
  end if;
  -- Agences de départ / d'arrivée déterminées par le serveur
  p_from_terminal := public.nzk_resolve_agency(p_from, p_from_terminal, public.nzk_trip_end_city(p_trip, 'origine'));
  p_to_terminal := public.nzk_resolve_agency(p_to, p_to_terminal, public.nzk_trip_end_city(p_trip, 'terminus'));
  if p_from_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_INTROUVABLE'); end if;
  select name into v_agency_name from public.terminals where id = p_from_terminal;

  -- Le moyen de paiement doit être un compte actif de l'agence de départ
  select id into v_account from public.agency_payment_accounts
  where terminal_id = p_from_terminal and provider = p_method and is_active order by updated_at desc limit 1;
  if v_account is null then return jsonb_build_object('ok', false, 'error', 'METHODE_INDISPONIBLE'); end if;
  v_tx_norm := public.nzk_norm_tx(p_transaction_code);
  if length(v_tx_norm) < 4 then return jsonb_build_object('ok', false, 'error', 'CODE_TRANSACTION_INVALIDE'); end if;
  if exists (select 1 from public.transaction_references where provider = p_method and code_norm = v_tx_norm) then
    return jsonb_build_object('ok', false, 'error', 'TRANSACTION_DEJA_UTILISEE');
  end if;

  -- Verrouille les sièges : ils doivent être bloqués par CE client et pas expirés
  select count(*) into v_held from (
    select 1 from public.trip_seats
    where trip_id = p_trip and seat_number = any (v_seats) and status = 'hold' and hold_token = p_token and expires_at > now()
    for update
  ) h;
  if v_held <> v_count then
    return jsonb_build_object('ok', false, 'error', 'SIEGES_NON_BLOQUES');
  end if;

  -- Prix officiel
  v_unit := (d->>'price')::int;
  select count(*) into v_premium from unnest(v_seats) s
  where public.nzk_seat_premium((d->'bus'->>'seats_per_row')::int, (d->'bus'->>'rows')::int, (d->'bus'->>'back_row_seats')::int, s);
  v_price := v_unit * v_count + v_premium * public.nzk_premium_supplement();

  -- Heure de montée à la ville de départ
  v_board := ((d->>'date')::date + (d->>'departure_time')::time)
           + make_interval(mins => case when d->>'direction' = 'aller' then (d->>'from_offset')::int
                                        else (d->>'max_offset')::int - (d->>'from_offset')::int end);

  if v_board <= public.nzk_now() then
    return jsonb_build_object('ok', false, 'error', 'DEPART_PASSE');
  end if;

  -- Référence unique NZK-AAMMJJ-XXXX
  loop
    v_ref := 'NZK-' || to_char(public.nzk_now(), 'YYMMDD') || '-' ||
             (select string_agg(substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;

  insert into public.transaction_references (provider, code_norm, source, source_id)
  values (p_method, v_tx_norm, 'booking', v_booking);

  insert into public.bookings (id, reference, trip_id, corridor_id, from_city, to_city, from_terminal, to_terminal,
                               date, departure_time, total_price, passenger_count, status,
                               customer_phone, customer_email, access_key)
  values (v_booking, v_ref, p_trip, d->>'corridor_id', p_from, p_to, p_from_terminal, p_to_terminal,
          v_board::date, to_char(v_board, 'HH24:MI'), v_price, v_count, 'pending',
          nullif(trim(p_customer_phone), ''), nullif(lower(trim(p_customer_email)), ''), v_key);

  for p in select * from jsonb_array_elements(p_passengers) loop
    insert into public.passengers (booking_id, full_name, phone, seat_number, is_primary)
    values (v_booking, trim(p->>'full_name'), nullif(trim(p->>'phone'), ''), p->>'seat', i = 0);
    i := i + 1;
  end loop;

  insert into public.payments (booking_id, method, amount, transaction_code, phone_sender, status, agency_id, account_id)
  values (v_booking, p_method, v_price, trim(p_transaction_code), trim(p_phone_sender), 'pending', p_from_terminal, v_account);

  update public.trip_seats
  set status = 'booked', booking_id = v_booking, hold_token = null, expires_at = null
  where trip_id = p_trip and seat_number = any (v_seats);

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'reference', v_ref, 'access_key', v_key,
                            'total_price', v_price, 'unit_price', v_unit, 'premium_seats', v_premium,
                            'agency_id', p_from_terminal, 'agency_name', v_agency_name);
end $$;

create or replace function public.nzk_reject_payment(p_booking uuid, p_agent uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record;
begin
  if not public.nzk_agent_can_handle(p_agent, p_booking) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into bk from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if bk.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'STATUT_INCOMPATIBLE'); end if;
  update public.payments set status = 'rejected', confirmed_by = p_agent, confirmed_at = now(),
         notes = coalesce(nullif(trim(p_reason), ''), 'Paiement non reçu')
  where booking_id = p_booking and status = 'pending';
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking;
  delete from public.trip_seats where booking_id = p_booking;
  delete from public.transaction_references where source = 'booking' and source_id = p_booking;
  return jsonb_build_object('ok', true, 'reference', bk.reference);
end $$;

create or replace function public.nzk_cancel_booking(p_booking uuid, p_agent uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record;
begin
  if not public.nzk_agent_can_handle(p_agent, p_booking) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into bk from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if bk.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'DEJA_ANNULEE'); end if;
  if exists (select 1 from public.tickets where booking_id = p_booking and status = 'used') then
    return jsonb_build_object('ok', false, 'error', 'BILLET_DEJA_UTILISE');
  end if;
  update public.payments set status = 'rejected', notes = coalesce(nullif(trim(p_reason), ''), 'Réservation annulée')
  where booking_id = p_booking and status = 'pending';
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking;
  update public.tickets set status = 'cancelled' where booking_id = p_booking and status = 'valid';
  delete from public.trip_seats where booking_id = p_booking;
  if bk.status <> 'confirmed' then
    delete from public.transaction_references where source = 'booking' and source_id = p_booking;
  end if;
  return jsonb_build_object('ok', true, 'reference', bk.reference, 'was_paid', bk.status = 'confirmed');
end $$;

create or replace function public.nzk_parcel_create(p_agent uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a record; q jsonb; v_id uuid := gen_random_uuid(); v_ref text; v_qr text; v_code text;
  v_from_t text := p->>'from_terminal'; v_to_t text := p->>'to_terminal'; v_from_c text; v_to_c text;
  v_qty int := coalesce(nullif(p->>'quantity', '')::int, 1);
  v_weight numeric := nullif(p->>'weight_kg', '')::numeric;
  v_value int := nullif(p->>'declared_value', '')::int;
  v_payer text := p->>'payer'; v_method text := p->>'method'; v_tx text := nullif(trim(coalesce(p->>'transaction_code', '')), '');
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;

  select city_id into v_from_c from public.terminals where id = v_from_t and is_active;
  select city_id into v_to_c from public.terminals where id = v_to_t and is_active;
  if v_from_c is null or v_to_c is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_INVALIDE'); end if;
  if v_from_c = v_to_c then return jsonb_build_object('ok', false, 'error', 'MEME_VILLE'); end if;
  if not public.nzk_agent_covers(p_agent, v_from_t) then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;

  if length(trim(coalesce(p->>'sender_name', ''))) < 2 or length(trim(coalesce(p->>'recipient_name', ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'NOM_MANQUANT');
  end if;
  if length(public.nzk_digits(p->>'sender_phone')) < 8 or length(public.nzk_digits(p->>'recipient_phone')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'TELEPHONE_INVALIDE');
  end if;
  if length(trim(coalesce(p->>'description', ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'DESCRIPTION_MANQUANTE'); end if;
  if v_qty not between 1 and 100 then return jsonb_build_object('ok', false, 'error', 'QUANTITE_INVALIDE'); end if;
  if v_weight is not null and (v_weight < 0 or v_weight > 2000) then return jsonb_build_object('ok', false, 'error', 'POIDS_INVALIDE'); end if;
  if v_value is not null and v_value < 0 then return jsonb_build_object('ok', false, 'error', 'VALEUR_INVALIDE'); end if;
  if coalesce(v_payer, '') not in ('expediteur', 'destinataire') then return jsonb_build_object('ok', false, 'error', 'PAYEUR_INVALIDE'); end if;
  if v_payer = 'expediteur' then
    if coalesce(v_method, '') not in ('especes', 'mtn', 'airtel') then return jsonb_build_object('ok', false, 'error', 'METHODE_INVALIDE'); end if;
    if v_method in ('mtn', 'airtel') and coalesce(length(v_tx), 0) < 4 then return jsonb_build_object('ok', false, 'error', 'CODE_TRANSACTION_INVALIDE'); end if;
  end if;

  -- Prix officiel calculé ici (jamais reçu du navigateur)
  q := public.nzk_parcel_quote(p->>'category_id', v_from_c, v_to_c, v_weight, v_qty);
  if not (q->>'ok')::boolean then return q; end if;

  loop
    v_ref := 'NZK-C-' || (select string_agg(substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.parcels where reference = v_ref);
  end loop;
  loop
    v_qr := upper(encode(gen_random_bytes(10), 'hex'));
    exit when not exists (select 1 from public.parcels where qr_code = v_qr);
  end loop;
  v_code := public.nzk_new_pickup_code();

  if v_payer = 'expediteur' and v_method in ('mtn', 'airtel') then
    if exists (select 1 from public.transaction_references where provider = v_method and code_norm = public.nzk_norm_tx(v_tx)) then
      return jsonb_build_object('ok', false, 'error', 'TRANSACTION_DEJA_UTILISEE');
    end if;
    insert into public.transaction_references (provider, code_norm, source, source_id) values (v_method, public.nzk_norm_tx(v_tx), 'parcel', v_id);
  end if;

  insert into public.parcels (id, reference, qr_code, pickup_code_hash, sender_name, sender_phone, recipient_name, recipient_phone,
                              from_city, from_terminal, to_city, to_terminal, category_id, description, quantity, weight_kg,
                              declared_value, notes, price, payer, payment_status, status, created_by)
  values (v_id, v_ref, v_qr, crypt(v_code, gen_salt('bf')), trim(p->>'sender_name'), trim(p->>'sender_phone'),
          trim(p->>'recipient_name'), trim(p->>'recipient_phone'), v_from_c, v_from_t, v_to_c, v_to_t,
          p->>'category_id', left(trim(p->>'description'), 200), v_qty, v_weight, v_value,
          nullif(left(trim(coalesce(p->>'notes', '')), 500), ''), (q->>'price')::int, v_payer,
          case when v_payer = 'expediteur' then 'paye' else 'a_payer' end, 'depose', p_agent);

  perform public.nzk_parcel_log(v_id, null, 'depose', 'depot', p_agent, v_from_t, null, null);

  if v_payer = 'expediteur' then
    insert into public.parcel_payments (parcel_id, amount, method, transaction_code, moment, collected_by, terminal_id)
    values (v_id, (q->>'price')::int, v_method, v_tx, 'depot', p_agent, v_from_t);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'reference', v_ref, 'pickup_code', v_code, 'price', (q->>'price')::int);
end $$;

create or replace function public.nzk_parcel_pickup(p_agent uuid, p_parcel uuid, p_code text, p_method text, p_transaction_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record; a record; v_left int;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into pc from public.parcels where id = p_parcel for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if pc.status <> 'pret_au_retrait' then return jsonb_build_object('ok', false, 'error', 'PAS_PRET'); end if;
  if not public.nzk_agent_covers(p_agent, pc.to_terminal) then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
  if pc.pickup_locked_until is not null and pc.pickup_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'CODE_BLOQUE', 'locked_until', pc.pickup_locked_until);
  end if;

  if p_code is null or p_code !~ '^\d{6}$' or crypt(p_code, pc.pickup_code_hash) <> pc.pickup_code_hash then
    update public.parcels
    set pickup_failed_attempts = pickup_failed_attempts + 1,
        pickup_locked_until = case when pickup_failed_attempts + 1 >= 5 then now() + interval '30 minutes' else null end
    where id = p_parcel;
    perform public.nzk_parcel_log(p_parcel, pc.status, pc.status, 'code_incorrect', p_agent, pc.to_terminal, pc.trip_id,
                                  'Code de retrait incorrect (' || (pc.pickup_failed_attempts + 1) || '/5)');
    v_left := greatest(0, 5 - (pc.pickup_failed_attempts + 1));
    return jsonb_build_object('ok', false, 'error', case when v_left = 0 then 'CODE_BLOQUE' else 'CODE_INCORRECT' end, 'attempts_left', v_left);
  end if;

  if pc.payment_status = 'a_payer' then
    if coalesce(p_method, '') not in ('especes', 'mtn', 'airtel') then return jsonb_build_object('ok', false, 'error', 'PAIEMENT_REQUIS', 'amount', pc.price); end if;
    if p_method in ('mtn', 'airtel') and coalesce(length(trim(p_transaction_code)), 0) < 4 then
      return jsonb_build_object('ok', false, 'error', 'CODE_TRANSACTION_INVALIDE');
    end if;
    if p_method in ('mtn', 'airtel') then
      if exists (select 1 from public.transaction_references where provider = p_method and code_norm = public.nzk_norm_tx(p_transaction_code)) then
        return jsonb_build_object('ok', false, 'error', 'TRANSACTION_DEJA_UTILISEE');
      end if;
      insert into public.transaction_references (provider, code_norm, source, source_id)
      values (p_method, public.nzk_norm_tx(p_transaction_code), 'parcel_retrait', p_parcel);
    end if;
    insert into public.parcel_payments (parcel_id, amount, method, transaction_code, moment, collected_by, terminal_id)
    values (p_parcel, pc.price, p_method, nullif(trim(coalesce(p_transaction_code, '')), ''), 'retrait', p_agent, pc.to_terminal);
  end if;

  update public.parcels
  set status = 'retire', payment_status = 'paye', picked_up_at = now(), picked_up_by = p_agent,
      pickup_failed_attempts = 0, pickup_locked_until = null, updated_at = now()
  where id = p_parcel;
  perform public.nzk_parcel_log(p_parcel, pc.status, 'retire', 'retrait', p_agent, pc.to_terminal, pc.trip_id, 'Code vérifié, colis remis au destinataire');
  return jsonb_build_object('ok', true, 'reference', pc.reference, 'status', 'retire');
end $$;

create or replace function public.nzk_parcel_list(p_agent uuid, p_filter text, p_query text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_q text := nullif(trim(coalesce(p_query, '')), ''); v_digits text;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return '[]'::jsonb; end if;
  v_digits := public.nzk_digits(v_q);
  return coalesce((
    select jsonb_agg(public.nzk_parcel_row(x.pc) order by (x.pc).created_at desc)
    from (
      select pc from public.parcels pc
      where (a.role in ('admin', 'finance') or pc.from_terminal = a.terminal_id or pc.to_terminal = a.terminal_id)
        and case p_filter
          when 'jour'       then (pc.created_at at time zone 'Africa/Brazzaville')::date = coalesce(p_date, (public.nzk_now())::date)
          when 'a_affecter' then pc.status = 'depose'
          when 'a_charger'  then pc.status = 'affecte'
          when 'en_transit' then pc.status in ('charge', 'en_transit')
          when 'arrives'    then pc.status = 'arrive'
          when 'a_retirer'  then pc.status = 'pret_au_retrait'
          when 'retires'    then pc.status = 'retire'
          when 'incidents'  then pc.status = 'incident'
          when 'annules'    then pc.status = 'annule'
          when 'recherche'  then v_q is not null and (
                                   pc.reference ilike '%' || v_q || '%'
                                   or (length(v_digits) >= 4 and (public.nzk_digits(pc.sender_phone) like '%' || v_digits || '%'
                                                                  or public.nzk_digits(pc.recipient_phone) like '%' || v_digits || '%'))
                                   or pc.sender_name ilike '%' || v_q || '%' or pc.recipient_name ilike '%' || v_q || '%')
          else true end
      order by pc.created_at desc
      limit 200
    ) x), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------
-- 11. RLS : chaque agent ne lit que les opérations de son agence
-- ------------------------------------------------------------
drop policy if exists "agents_lisent_reservations" on public.bookings;
create policy "agents_lisent_reservations" on public.bookings
  for select to authenticated using (public.nzk_can_see_booking(id));

drop policy if exists "agents_modifient_reservations" on public.bookings;
create policy "admin_modifie_reservations" on public.bookings
  for update to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "agents_lisent_passagers" on public.passengers;
create policy "agents_lisent_passagers" on public.passengers
  for select to authenticated using (public.nzk_can_see_booking(booking_id));

drop policy if exists "agents_lisent_paiements" on public.payments;
create policy "agents_lisent_paiements" on public.payments
  for select to authenticated using (public.nzk_can_see_payment_agency(agency_id, booking_id));

drop policy if exists "agents_modifient_paiements" on public.payments;
create policy "admin_modifie_paiements" on public.payments
  for update to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "agents_lisent_billets" on public.tickets;
create policy "agents_lisent_billets" on public.tickets
  for select to authenticated using (public.nzk_can_see_booking(booking_id));

drop policy if exists "agents_lisent_scans" on public.ticket_scans;
create policy "agents_lisent_scans" on public.ticket_scans
  for select to authenticated using (ticket_id is not null and public.nzk_can_see_booking((select booking_id from public.tickets where id = ticket_id)));

-- ------------------------------------------------------------
-- 12. Droits d'exécution
-- ------------------------------------------------------------
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('nzk_norm_tx', 'nzk_agent', 'nzk_agent_covers', 'nzk_agent_can_handle', 'nzk_trip_end_city', 'nzk_resolve_agency',
                        'nzk_trip_payment_info', 'nzk_payment_accounts', 'nzk_payment_account_save', 'nzk_pending_payments',
                        'nzk_finance_report', 'nzk_create_booking', 'nzk_reject_payment', 'nzk_cancel_booking',
                        'nzk_parcel_create', 'nzk_parcel_pickup', 'nzk_parcel_list')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  -- Utilisées par les politiques RLS : exécutables par les utilisateurs connectés (lecture de leur propre périmètre)
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('nzk_my_scope', 'nzk_can_see_booking', 'nzk_can_see_payment_agency')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;



  -- ==================== TESTS ====================
  r := r || 'Données avant (réservations/paiements/colis) : ' || avant || chr(10);
  select count(*) into n from public.payments where agency_id is not null;
  r := r || 'ℹ️ paiements existants rattachés à une agence : ' || n || ' / ' || (select count(*) from public.payments) || chr(10);

  -- Comptes de paiement : seul le central peut les modifier
  update public.agent_profiles set role = 'agent', terminal_id = 'mpila' where id = a;
  j := public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"mtn","number":"060000001","holder_name":"TEST"}');
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'agent d''agence modifie un numéro : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'manager', terminal_id = 'mpila' where id = a;
  j := public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"mtn","number":"060000001","holder_name":"TEST"}');
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'responsable d''agence modifie un numéro : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'finance', terminal_id = null where id = a;
  j := public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"mtn","number":"06 000 00 01","holder_name":"TEST Nzoko Mpila"}');
  r := r || case when (j->>'ok')::boolean then '✅ ' else '❌ ' end || 'Finance crée le compte MTN de Mpila : ' || coalesce(j->>'ok', j->>'error') || chr(10);
  update public.agent_profiles set role = 'admin', terminal_id = null where id = a;
  perform public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"airtel","number":"05 000 00 02","holder_name":"TEST Nzoko Mpila"}');
  perform public.nzk_payment_account_save(a, '{"terminal_id":"centre-ville","provider":"mtn","number":"06 000 00 03","holder_name":"TEST Nzoko PNR"}');
  select count(*) into n from public.agency_payment_account_changes;
  r := r || case when n = 3 then '✅ ' else '❌ ' end || 'historique des modifications de numéros : ' || n || chr(10);

  select id into f from public.services where corridor_id = 'rn1' and is_active limit 1;
  v_trip := (select trip_id from public.nzk_get_departures('brazzaville', 'pointenoire', (public.nzk_now())::date + 2) limit 1);
  v_trip_r := (select trip_id from public.nzk_get_departures('pointenoire', 'brazzaville', (public.nzk_now())::date + 2) limit 1);
  r := r || case when v_trip is not null and v_trip_r is not null then '✅ ' else '❌ ' end || 'départs RN1 aller et retour disponibles' || chr(10);

  j := public.nzk_trip_payment_info(v_trip, 'brazzaville', 'pointenoire', 'mpila');
  r := r || case when j->>'agency_id' = 'mpila' and jsonb_array_length(j->'accounts') = 2 then '✅ ' else '❌ ' end || 'Mpila → Pointe-Noire : agence ' || (j->>'agency_name') || ', comptes ' || (select string_agg(x->>'provider' || ' ' || (x->>'number'), ', ') from jsonb_array_elements(j->'accounts') x) || chr(10);

  j := public.nzk_trip_payment_info(v_trip_r, 'pointenoire', 'brazzaville', 'centre-ville');
  r := r || case when j->>'agency_id' = 'centre-ville' and jsonb_array_length(j->'accounts') = 1 then '✅ ' else '❌ ' end || 'Centre-ville → Brazzaville : agence ' || (j->>'agency_name') || ', ' || jsonb_array_length(j->'accounts') || ' compte' || chr(10);

  j := public.nzk_trip_payment_info(v_trip, 'brazzaville', 'pointenoire', null);
  r := r || case when j->>'agency_id' is not null then '✅ ' else '❌ ' end || 'sans agence choisie : agence principale ' || coalesce(j->>'agency_name','?') || chr(10);

  j := public.nzk_trip_payment_info(v_trip, 'kinkala', 'pointenoire', null);
  r := r || case when (select city_id from public.terminals where id = j->>'agency_id') = 'brazzaville' then '✅ ' else '❌ ' end || 'ville sans agence (Kinkala) : rattachée à ' || coalesce(j->>'agency_name','?') || ' (départ du bus)' || chr(10);


  -- Réservation : agence de départ, compte, référence unique
  perform public.nzk_hold_seat(v_trip, 'B6', 'tok-multi-aaaaaaaaaaaaaaaaaa');
  jb := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', 'centre-ville', 'tok-multi-aaaaaaaaaaaaaaaaaa',
        '[{"full_name":"TEST Multi","phone":"060007777","seat":"B6"}]'::jsonb, '060007777', null, 'mtn', 'TEST-MULTI-001', '060007777');
  b1 := (jb->>'booking_id')::uuid;
  r := r || case when (jb->>'ok')::boolean and jb->>'agency_id' = 'mpila' then '✅ ' else '❌ ' end || 'réservation depuis Mpila : ' || coalesce(jb->>'agency_name', jb->>'error') || ' · ' || coalesce(jb->>'total_price','') || chr(10);
  select count(*) into n from public.payments where booking_id = b1 and agency_id = 'mpila' and account_id is not null and status = 'pending' and amount = (jb->>'total_price')::int;
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'paiement en attente : agence, compte, montant officiel enregistrés' || chr(10);
  select count(*) into n from public.bookings where id = b1 and from_terminal = 'mpila' and to_terminal = 'centre-ville' and status = 'pending';
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'réservation rattachée à Mpila → Centre-ville, en attente (pas de confirmation automatique)' || chr(10);

  perform public.nzk_hold_seat(v_trip, 'B7', 'tok-multi-bbbbbbbbbbbbbbbbbb');
  jc := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', 'centre-ville', 'tok-multi-bbbbbbbbbbbbbbbbbb',
        '[{"full_name":"TEST Multi","phone":"060007777","seat":"B7"}]'::jsonb, '060007777', null, 'mtn', 'test multi 001', '060007777');
  r := r || case when jc->>'error' = 'TRANSACTION_DEJA_UTILISEE' then '✅ ' else '❌ ' end || 'même référence MTN réutilisée : ' || coalesce(jc->>'error','ACCEPTÉE') || chr(10);

  perform public.nzk_hold_seat(v_trip_r, 'C6', 'tok-multi-cccccccccccccccccc');
  jc := public.nzk_create_booking(v_trip_r, 'pointenoire', 'brazzaville', 'centre-ville', 'mpila', 'tok-multi-cccccccccccccccccc',
        '[{"full_name":"TEST Multi","phone":"060007777","seat":"C6"}]'::jsonb, '060007777', null, 'airtel', 'TEST-MULTI-AIR', '060007777');
  r := r || case when jc->>'error' = 'METHODE_INDISPONIBLE' then '✅ ' else '❌ ' end || 'Airtel depuis Centre-ville (pas de compte Airtel) : ' || coalesce(jc->>'error','ACCEPTÉ') || chr(10);

  -- Qui peut confirmer ?
  update public.agent_profiles set role = 'agent', terminal_id = 'centre-ville' where id = a;
  j := public.nzk_confirm_payment(b1, a);
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'agent Centre-ville confirme un paiement de Mpila : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'manager', terminal_id = 'centre-ville' where id = a;
  j := public.nzk_confirm_payment(b1, a);
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'responsable Centre-ville confirme un paiement de Mpila : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  j := public.nzk_reject_payment(b1, a, 'TEST');
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'responsable Centre-ville refuse un paiement de Mpila : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'agent', terminal_id = null where id = a;
  j := public.nzk_confirm_payment(b1, a);
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'agent sans agence confirme : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'agent', terminal_id = 'centre-ville' where id = a;
  j := public.nzk_pending_payments(a, 'pending');
  r := r || case when not exists (select 1 from jsonb_array_elements(j) x where (x->>'booking_id')::uuid = b1) then '✅ ' else '❌ ' end || 'agent Centre-ville voit les paiements de Mpila : non' || chr(10);

  -- Lecture directe (RLS) par un agent Centre-ville connecté
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments where booking_id = b1;    r := r || case when n = 0 then '✅' else '❌' end || ' agent Centre-ville lit le paiement de Mpila (RLS) : ' || n || chr(10);
  select count(*) into n from public.bookings where id = b1 and from_terminal = 'mpila';
  r := r || 'ℹ️ agent Centre-ville voit la réservation (passagers arrivant chez lui) : ' || n || chr(10);
  execute 'reset role';
  update public.agent_profiles set role = 'agent', terminal_id = 'mpila' where id = a;
  j := public.nzk_pending_payments(a, 'pending');
  r := r || case when exists (select 1 from jsonb_array_elements(j) x where (x->>'booking_id')::uuid = b1) then '✅ ' else '❌ ' end || 'agent Mpila voit le paiement à vérifier' || chr(10);
  j := public.nzk_confirm_payment(b1, a);
  r := r || case when (j->>'ok')::boolean and (j->>'tickets')::int = 1 then '✅ ' else '❌ ' end || 'agent Mpila confirme → billets créés : ' || coalesce(j->>'tickets', j->>'error') || chr(10);
  select count(*) into n from public.payments where booking_id = b1 and status = 'confirmed' and confirmed_by = a and confirmed_at is not null;
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'confirmation enregistrée (agent + date)' || chr(10);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.payments where booking_id = b1;    r := r || case when n = 1 then '✅' else '❌' end || ' agent Mpila lit son paiement (RLS) : ' || n || chr(10);
  execute 'reset role';

  -- Refus : la référence redevient utilisable
  perform public.nzk_hold_seat(v_trip, 'B8', 'tok-multi-dddddddddddddddddd');
  jc := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', 'centre-ville', 'tok-multi-dddddddddddddddddd',
        '[{"full_name":"TEST Multi","phone":"060007777","seat":"B8"}]'::jsonb, '060007777', null, 'mtn', 'TEST-MULTI-002', '060007777');
  b2 := (jc->>'booking_id')::uuid;
  j := public.nzk_reject_payment(b2, a, 'TEST paiement non reçu');
  perform public.nzk_hold_seat(v_trip, 'B9', 'tok-multi-eeeeeeeeeeeeeeeeee');
  jc := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', 'centre-ville', 'tok-multi-eeeeeeeeeeeeeeeeee',
        '[{"full_name":"TEST Multi","phone":"060007777","seat":"B9"}]'::jsonb, '060007777', null, 'mtn', 'TEST-MULTI-002', '060007777');
  r := r || case when (jc->>'ok')::boolean then '✅ ' else '❌ ' end || 'référence d''un paiement refusé réutilisable : ' || coalesce(jc->>'ok', jc->>'error') || chr(10);

  -- Colis : même registre de références
  j := public.nzk_parcel_create(a, jsonb_build_object('sender_name','TEST','sender_phone','060007777','recipient_name','TEST','recipient_phone','050007777',
        'from_terminal','mpila','to_terminal','centre-ville','category_id','petit','description','TEST','payer','expediteur','method','mtn','transaction_code','TEST-MULTI-001'));
  r := r || case when j->>'error' = 'TRANSACTION_DEJA_UTILISEE' then '✅ ' else '❌ ' end || 'colis payé avec une référence déjà utilisée : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);

  -- Rapports
  update public.agent_profiles set role = 'manager', terminal_id = 'centre-ville' where id = a;
  j := public.nzk_finance_report(a, (public.nzk_now())::date, (public.nzk_now())::date);
  r := r || case when j->>'scope' = 'agence' and jsonb_array_length(j->'agencies') = 1 then '✅ ' else '❌ ' end || 'responsable Centre-ville : rapport limité à ' || (j->'agencies'->0->>'agency_name') || chr(10);
  update public.agent_profiles set role = 'agent', terminal_id = 'mpila' where id = a;
  j := public.nzk_finance_report(a, (public.nzk_now())::date, (public.nzk_now())::date);
  r := r || case when j->>'error' = 'NON_AUTORISE' then '✅ ' else '❌ ' end || 'simple agent demande le rapport financier : ' || coalesce(j->>'error','ACCEPTÉ') || chr(10);
  update public.agent_profiles set role = 'finance', terminal_id = null where id = a;
  j := public.nzk_finance_report(a, (public.nzk_now())::date, (public.nzk_now())::date);
  select x into jc from jsonb_array_elements(j->'agencies') x where x->>'agency_id' = 'mpila';
  r := r || case when j->>'scope' = 'reseau' and jsonb_array_length(j->'agencies') = 6 and (jc->>'voyageurs_mtn')::int = (jb->>'total_price')::int then '✅ ' else '❌ ' end || 'Finance : réseau ' || jsonb_array_length(j->'agencies') || ' agences, Mpila MTN ' || (jc->>'voyageurs_mtn') || ' FCFA, en attente ' || (jc->>'en_attente_count') || chr(10);

  r := r || 'Données après les tests (avant annulation) : ' || (select count(*) from public.bookings)::text || ' réservations' || chr(10);
  raise exception E'RÉSULTATS DU TEST À BLANC — multi-agences (tout a été annulé)\n%', r;
end
$test$;
