-- ============================================================
-- Nzoko Transport — Préparation avant envoi à une agence (8 octobre 2026)
--
-- Ajouts uniquement, aucune donnée supprimée :
--  1. Réservations non payées : expiration automatique après 30 minutes
--     (réservation « expired », paiement « expired », sièges libérés), appliquée
--     par la base à chaque lecture / blocage / confirmation.
--  2. Anti-blocage massif : 10 sièges bloqués maximum par appareil et par départ,
--     3 réservations en attente maximum par appareil.
--  3. Comptes Mobile Money de démonstration (is_demo) : jamais montrés au public,
--     réservations de démonstration exclues des revenus.
--  4. Vente au guichet en espèces (nzk_counter_sale) : réservation confirmée + billets.
--  5. Gestion d'un départ précis : changement de bus contrôlé, retard, annulation
--     (historique dans trip_events, réservations conservées).
--  6. « Mes réservations » : référence + téléphone obligatoires, tentatives limitées.
--     Le billet sans clé d'accès ne révèle plus rien.
--  7. Tableau de bord : chiffres réels (nzk_dashboard).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Colonnes et tables (additives)
-- ------------------------------------------------------------
alter table public.agency_payment_accounts add column if not exists is_demo boolean not null default false;

alter table public.bookings
  add column if not exists is_demo boolean not null default false,
  add column if not exists sale_channel text not null default 'en_ligne',
  add column if not exists client_hash text,
  add column if not exists expired_at timestamptz;

alter table public.trip_seats add column if not exists hold_client text;

alter table public.trips
  add column if not exists delay_minutes integer not null default 0,
  add column if not exists status_reason text,
  add column if not exists status_note text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by uuid references public.agent_profiles(id) on delete set null;

create table if not exists public.trip_events (
  id         bigserial primary key,
  trip_id    uuid not null references public.trips(id) on delete cascade,
  action     text not null,
  before     jsonb,
  after      jsonb,
  note       text,
  agent_id   uuid references public.agent_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists trip_events_trip_idx on public.trip_events (trip_id, id);

create table if not exists public.booking_lookup_attempts (
  key          text primary key,
  failures     integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.trip_events             enable row level security;
alter table public.booking_lookup_attempts enable row level security;
revoke all on public.trip_events, public.booking_lookup_attempts from anon, authenticated;
revoke all on sequence public.trip_events_id_seq from anon, authenticated;

create index if not exists bookings_pending_created_idx on public.bookings (created_at) where status = 'pending';

-- ------------------------------------------------------------
-- 1. Expiration des réservations non confirmées
-- ------------------------------------------------------------
create or replace function public.nzk_pending_ttl()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

create or replace function public.nzk_expire_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.payments
  set status = 'expired', notes = 'Expiré : paiement non confirmé dans les 30 minutes'
  where booking_id = p_booking and status = 'pending';
  update public.bookings set status = 'expired', expired_at = now() where id = p_booking and status = 'pending';
  delete from public.trip_seats where booking_id = p_booking;
  delete from public.transaction_references where source = 'booking' and source_id = p_booking;
end $$;

-- Expire les réservations en attente trop anciennes (d'un départ, ou de tout le réseau).
-- SKIP LOCKED : une réservation en cours de confirmation par un agent n'est jamais touchée.
create or replace function public.nzk_expire_pending(p_trip uuid default null)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare bk record; n int := 0;
begin
  for bk in
    select id from public.bookings
    where status = 'pending' and created_at < now() - public.nzk_pending_ttl()
      and (p_trip is null or trip_id = p_trip)
    for update skip locked
  loop
    perform public.nzk_expire_booking(bk.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.nzk_purge_holds(p_trip uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.nzk_expire_pending(p_trip);
  delete from public.trip_seats where trip_id = p_trip and status = 'hold' and expires_at < now();
end $$;

-- ------------------------------------------------------------
-- 2. Blocage de sièges : limite par appareil
-- ------------------------------------------------------------
drop function if exists public.nzk_hold_seat(uuid, text, text);
create or replace function public.nzk_hold_seat(p_trip uuid, p_seat text, p_token text, p_client text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare b record; v_exp timestamptz := now() + interval '15 minutes'; v_count int; v_ok text;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'TOKEN_INVALIDE');
  end if;
  perform public.nzk_purge_holds(p_trip);
  select tr.status, tr.date, bu.seats_per_row, bu.rows, bu.back_row_seats into b
  from public.trips tr join public.services sv on sv.id = tr.service_id
  join public.buses bu on bu.id = coalesce(tr.bus_id, sv.bus_id)
  where tr.id = p_trip;
  if not found or b.status <> 'scheduled' or b.date < (public.nzk_now())::date then
    return jsonb_build_object('ok', false, 'error', 'DEPART_INDISPONIBLE');
  end if;
  if not public.nzk_seat_valid(b.seats_per_row, b.rows, b.back_row_seats, p_seat) then
    return jsonb_build_object('ok', false, 'error', 'SIEGE_INVALIDE');
  end if;
  select count(*) into v_count from public.trip_seats
  where trip_id = p_trip and hold_token = p_token and status = 'hold' and expires_at > now() and seat_number <> p_seat;
  if v_count >= 10 then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_SIEGES');
  end if;
  if p_client is not null then
    select count(*) into v_count from public.trip_seats
    where trip_id = p_trip and hold_client = p_client and status = 'hold' and expires_at > now()
      and not (seat_number = p_seat and hold_token = p_token);
    if v_count >= 10 then
      return jsonb_build_object('ok', false, 'error', 'TROP_DE_SIEGES');
    end if;
  end if;

  insert into public.trip_seats (trip_id, seat_number, status, hold_token, hold_client, expires_at)
  values (p_trip, p_seat, 'hold', p_token, p_client, v_exp)
  on conflict (trip_id, seat_number) do update
    set hold_token = excluded.hold_token, hold_client = excluded.hold_client, expires_at = excluded.expires_at, created_at = now()
    where public.trip_seats.status = 'hold'
      and (public.trip_seats.expires_at < now() or public.trip_seats.hold_token = excluded.hold_token)
  returning seat_number into v_ok;

  if v_ok is null then
    return jsonb_build_object('ok', false, 'error', 'SIEGE_PRIS');
  end if;
  return jsonb_build_object('ok', true, 'seat', p_seat, 'expires_at', v_exp);
end $$;

-- ------------------------------------------------------------
-- 3. Départs : statut, retard, départs annulés visibles (non réservables)
-- ------------------------------------------------------------
drop function if exists public.nzk_get_departures(text, text, date);
create or replace function public.nzk_get_departures(p_from text, p_to text, p_date date)
returns table (
  trip_id uuid, corridor_id text, corridor_label text, direction text,
  boarding_at timestamp, arrival_at timestamp, duration_min int, distance_km int,
  price int, premium_supplement int,
  bus_name text, bus_type text, amenities text[], seats_total int, seats_taken int,
  trip_status text, delay_minutes int, status_reason text
)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  s record; t text; v_dir text;
begin
  if p_date is null or p_date < (public.nzk_now())::date or p_from = p_to then return; end if;
  perform public.nzk_expire_pending(null);

  for s in
    select sv.id as service_id, sv.corridor_id, sv.departure_times, sv.bus_id, f.stop_order as f_order, tt.stop_order as t_order
    from public.services sv
    join public.corridors c on c.id = sv.corridor_id and c.is_active
    join public.buses b on b.id = sv.bus_id and b.is_active
    join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
    join public.corridor_stops tt on tt.corridor_id = sv.corridor_id and tt.city_id = p_to
    where sv.is_active
  loop
    v_dir := case when s.f_order < s.t_order then 'aller' else 'retour' end;
    foreach t in array s.departure_times loop
      if t ~ '^\d{2}:\d{2}$' then
        insert into public.trips (service_id, date, departure_time, direction, bus_id, status)
        values (s.service_id, p_date, t, v_dir, s.bus_id, 'scheduled')
        on conflict (service_id, date, departure_time, direction) do nothing;
      end if;
    end loop;
  end loop;

  return query
  with base as (
    select tr.id, tr.direction, tr.date, tr.departure_time, tr.status, tr.delay_minutes, tr.status_reason,
           sv.corridor_id, c.label,
           b.name, b.bus_type, b.amenities, b.seats_per_row, b.rows, b.back_row_seats,
           f.offset_minutes as f_off, f.distance_km as f_km, tt.offset_minutes as t_off, tt.distance_km as t_km,
           (select max(offset_minutes) from public.corridor_stops x where x.corridor_id = sv.corridor_id) as max_off
    from public.trips tr
    join public.services sv on sv.id = tr.service_id and sv.is_active
    join public.corridors c on c.id = sv.corridor_id
    join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
    join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
    join public.corridor_stops tt on tt.corridor_id = sv.corridor_id and tt.city_id = p_to
    where tr.date = p_date and tr.status in ('scheduled', 'cancelled')
      and tr.direction = case when f.stop_order < tt.stop_order then 'aller' else 'retour' end
      and tr.departure_time = any (sv.departure_times)
  ), timed as (
    select *,
      (date + departure_time::time) + make_interval(mins => case when direction = 'aller' then f_off else max_off - f_off end) as b_at,
      (date + departure_time::time) + make_interval(mins => case when direction = 'aller' then t_off else max_off - t_off end) as a_at
    from base
  )
  select tm.id, tm.corridor_id, tm.label, tm.direction, tm.b_at, tm.a_at,
         abs(tm.t_off - tm.f_off), abs(tm.t_km - tm.f_km),
         public.nzk_segment_price(tm.corridor_id, p_from, p_to), public.nzk_premium_supplement(),
         tm.name, tm.bus_type, tm.amenities,
         tm.seats_per_row * (tm.rows - 1) + tm.back_row_seats,
         (select count(*)::int from public.trip_seats ts
           where ts.trip_id = tm.id and (ts.status = 'booked' or ts.expires_at > now())),
         tm.status, tm.delay_minutes, tm.status_reason
  from timed tm
  where tm.b_at + make_interval(mins => tm.delay_minutes) > public.nzk_now()
  order by tm.b_at;
end $$;

-- ------------------------------------------------------------
-- 4. Comptes de démonstration : jamais montrés au public
-- ------------------------------------------------------------
drop function if exists public.nzk_trip_payment_info(uuid, text, text, text);
create or replace function public.nzk_trip_payment_info(p_trip uuid, p_from text, p_to text, p_from_terminal text, p_include_demo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_agency text; v_accounts jsonb;
begin
  if public.nzk_city_agency_count(p_from) = 0 then
    return jsonb_build_object('status', 'aucune_agence', 'accounts', '[]'::jsonb);
  end if;
  v_agency := public.nzk_pick_agency(p_from, p_from_terminal);
  if v_agency is null then
    return jsonb_build_object('status', 'agence_a_choisir', 'accounts', '[]'::jsonb,
      'agencies', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from public.terminals where city_id = p_from and is_active));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('provider', a.provider, 'number', a.number, 'holder_name', a.holder_name, 'is_demo', a.is_demo) order by a.provider), '[]'::jsonb)
  into v_accounts
  from (select distinct on (provider) * from public.agency_payment_accounts
        where terminal_id = v_agency and is_active and (not is_demo or p_include_demo)
        order by provider, is_demo, updated_at desc) a;
  return jsonb_build_object(
    'status', case when jsonb_array_length(v_accounts) = 0 then 'indisponible' else 'ok' end,
    'agency_id', v_agency,
    'agency_name', (select name from public.terminals where id = v_agency),
    'agency_city', (select c.name from public.terminals t join public.cities c on c.id = t.city_id where t.id = v_agency),
    'accounts', v_accounts);
end $$;

-- ------------------------------------------------------------
-- 5. Réservation en ligne (comptes démo réservés à l'admin, limite par appareil)
-- ------------------------------------------------------------
drop function if exists public.nzk_create_booking(uuid, text, text, text, text, text, jsonb, text, text, text, text, text);
create or replace function public.nzk_create_booking(
  p_trip uuid, p_from text, p_to text, p_from_terminal text, p_to_terminal text, p_token text,
  p_passengers jsonb, p_customer_phone text, p_customer_email text,
  p_method text, p_transaction_code text, p_phone_sender text,
  p_allow_demo boolean default false, p_client text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  d jsonb; v_seats text[]; v_held int; v_count int; v_premium int; v_price int; v_unit int;
  v_booking uuid := gen_random_uuid(); v_ref text; v_key text := encode(gen_random_bytes(16), 'hex');
  v_board timestamp; p jsonb; i int := 0;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_account uuid; v_demo boolean; v_agency_name text; v_tx_norm text;
begin
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

  -- Un même appareil ne peut pas accumuler les réservations en attente
  if p_client is not null and (select count(*) from public.bookings
                               where client_hash = p_client and status = 'pending'
                                 and created_at > now() - public.nzk_pending_ttl()) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_RESERVATIONS');
  end if;

  d := public.nzk_trip_detail(p_trip, p_from, p_to);
  if d is null or (d->>'price') is null or d->>'status' <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'DEPART_INDISPONIBLE');
  end if;
  if public.nzk_city_agency_count(p_from) = 0 then return jsonb_build_object('ok', false, 'error', 'AGENCE_INTROUVABLE'); end if;
  p_from_terminal := public.nzk_pick_agency(p_from, p_from_terminal);
  if p_from_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_DEPART_A_CHOISIR'); end if;
  if public.nzk_city_agency_count(p_to) > 0 then
    p_to_terminal := public.nzk_pick_agency(p_to, p_to_terminal);
    if p_to_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_ARRIVEE_A_CHOISIR'); end if;
  else
    p_to_terminal := null;
  end if;
  select name into v_agency_name from public.terminals where id = p_from_terminal;

  -- Compte actif de l'agence de départ ; comptes de démonstration seulement pour l'admin connecté
  if not exists (select 1 from public.agency_payment_accounts
                 where terminal_id = p_from_terminal and is_active and (not is_demo or p_allow_demo)) then
    return jsonb_build_object('ok', false, 'error', 'AUCUN_COMPTE', 'agency_name', v_agency_name);
  end if;
  select id, is_demo into v_account, v_demo from public.agency_payment_accounts
  where terminal_id = p_from_terminal and provider = p_method and is_active and (not is_demo or p_allow_demo)
  order by is_demo, updated_at desc limit 1;
  if v_account is null then return jsonb_build_object('ok', false, 'error', 'METHODE_INDISPONIBLE'); end if;
  v_tx_norm := public.nzk_norm_tx(p_transaction_code);
  if length(v_tx_norm) < 4 then return jsonb_build_object('ok', false, 'error', 'CODE_TRANSACTION_INVALIDE'); end if;
  if exists (select 1 from public.transaction_references where provider = p_method and code_norm = v_tx_norm) then
    return jsonb_build_object('ok', false, 'error', 'TRANSACTION_DEJA_UTILISEE');
  end if;

  select count(*) into v_held from (
    select 1 from public.trip_seats
    where trip_id = p_trip and seat_number = any (v_seats) and status = 'hold' and hold_token = p_token and expires_at > now()
    for update
  ) h;
  if v_held <> v_count then
    return jsonb_build_object('ok', false, 'error', 'SIEGES_NON_BLOQUES');
  end if;

  v_unit := (d->>'price')::int;
  select count(*) into v_premium from unnest(v_seats) s
  where public.nzk_seat_premium((d->'bus'->>'seats_per_row')::int, (d->'bus'->>'rows')::int, (d->'bus'->>'back_row_seats')::int, s);
  v_price := v_unit * v_count + v_premium * public.nzk_premium_supplement();

  v_board := ((d->>'date')::date + (d->>'departure_time')::time)
           + make_interval(mins => case when d->>'direction' = 'aller' then (d->>'from_offset')::int
                                        else (d->>'max_offset')::int - (d->>'from_offset')::int end);
  if v_board <= public.nzk_now() then
    return jsonb_build_object('ok', false, 'error', 'DEPART_PASSE');
  end if;

  loop
    v_ref := 'NZK-' || to_char(public.nzk_now(), 'YYMMDD') || '-' ||
             (select string_agg(substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;

  insert into public.transaction_references (provider, code_norm, source, source_id)
  values (p_method, v_tx_norm, 'booking', v_booking);

  insert into public.bookings (id, reference, trip_id, corridor_id, from_city, to_city, from_terminal, to_terminal,
                               date, departure_time, total_price, passenger_count, status,
                               customer_phone, customer_email, access_key, is_demo, sale_channel, client_hash)
  values (v_booking, v_ref, p_trip, d->>'corridor_id', p_from, p_to, p_from_terminal, p_to_terminal,
          v_board::date, to_char(v_board, 'HH24:MI'), v_price, v_count, 'pending',
          nullif(trim(p_customer_phone), ''), nullif(lower(trim(p_customer_email)), ''), v_key,
          coalesce(v_demo, false), 'en_ligne', p_client);

  for p in select * from jsonb_array_elements(p_passengers) loop
    insert into public.passengers (booking_id, full_name, phone, seat_number, is_primary)
    values (v_booking, trim(p->>'full_name'), nullif(trim(p->>'phone'), ''), p->>'seat', i = 0);
    i := i + 1;
  end loop;

  insert into public.payments (booking_id, method, amount, transaction_code, phone_sender, status, agency_id, account_id)
  values (v_booking, p_method, v_price, trim(p_transaction_code), trim(p_phone_sender), 'pending', p_from_terminal, v_account);

  update public.trip_seats
  set status = 'booked', booking_id = v_booking, hold_token = null, hold_client = null, expires_at = null
  where trip_id = p_trip and seat_number = any (v_seats);

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'reference', v_ref, 'access_key', v_key,
                            'total_price', v_price, 'unit_price', v_unit, 'premium_seats', v_premium,
                            'agency_id', p_from_terminal, 'agency_name', v_agency_name, 'is_demo', coalesce(v_demo, false),
                            'expires_minutes', 30);
end $$;

-- ------------------------------------------------------------
-- 6. Confirmation : refusée si la réservation a expiré
-- ------------------------------------------------------------
create or replace function public.nzk_confirm_payment(p_booking uuid, p_agent uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record; v_pay uuid; v_n int := 0; ps record; v_code text;
begin
  if not public.nzk_agent_can_handle(p_agent, p_booking) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into bk from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if bk.status = 'confirmed' then return jsonb_build_object('ok', false, 'error', 'DEJA_CONFIRMEE'); end if;
  if bk.status = 'expired' then return jsonb_build_object('ok', false, 'error', 'RESERVATION_EXPIREE'); end if;
  if bk.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'STATUT_INCOMPATIBLE'); end if;
  if bk.created_at < now() - public.nzk_pending_ttl() then
    perform public.nzk_expire_booking(p_booking);
    return jsonb_build_object('ok', false, 'error', 'RESERVATION_EXPIREE');
  end if;

  select id into v_pay from public.payments where booking_id = p_booking and status = 'pending'
  order by created_at desc limit 1 for update;
  if v_pay is null then return jsonb_build_object('ok', false, 'error', 'AUCUN_PAIEMENT_EN_ATTENTE'); end if;

  update public.payments set status = 'confirmed', confirmed_by = p_agent, confirmed_at = now() where id = v_pay;
  update public.bookings set status = 'confirmed', confirmed_at = now() where id = p_booking;

  for ps in select id from public.passengers where booking_id = p_booking loop
    loop
      v_code := upper(encode(gen_random_bytes(10), 'hex'));
      begin
        insert into public.tickets (booking_id, passenger_id, code) values (p_booking, ps.id, v_code)
        on conflict (passenger_id) do nothing;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reference', bk.reference, 'tickets', v_n);
end $$;

-- ------------------------------------------------------------
-- 7. Vente au guichet (espèces) : réservation confirmée + billets immédiatement
-- ------------------------------------------------------------
create or replace function public.nzk_counter_sale(
  p_agent uuid, p_trip uuid, p_from text, p_to text, p_from_terminal text, p_to_terminal text,
  p_token text, p_passengers jsonb, p_customer_phone text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a record; d jsonb; v_seats text[]; v_held int; v_count int; v_premium int; v_price int; v_unit int;
  v_booking uuid := gen_random_uuid(); v_ref text; v_key text := encode(gen_random_bytes(16), 'hex');
  v_board timestamp; p jsonb; i int := 0; ps record; v_code text; v_n int := 0;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  -- Agent / responsable : vend uniquement depuis sa propre agence
  if a.role in ('agent', 'manager') then p_from_terminal := a.terminal_id; end if;
  if p_from_terminal is null or not exists (select 1 from public.terminals where id = p_from_terminal and city_id = p_from and is_active) then
    return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE');
  end if;

  if jsonb_typeof(p_passengers) <> 'array' then return jsonb_build_object('ok', false, 'error', 'PASSAGERS_INVALIDES'); end if;
  v_count := jsonb_array_length(p_passengers);
  if v_count < 1 or v_count > 10 then return jsonb_build_object('ok', false, 'error', 'PASSAGERS_INVALIDES'); end if;
  for p in select * from jsonb_array_elements(p_passengers) loop
    if coalesce(length(trim(p->>'full_name')), 0) < 2 then return jsonb_build_object('ok', false, 'error', 'NOM_PASSAGER_MANQUANT'); end if;
  end loop;
  select array_agg(x->>'seat') into v_seats from jsonb_array_elements(p_passengers) x;
  if (select count(distinct s) from unnest(v_seats) s) <> v_count then return jsonb_build_object('ok', false, 'error', 'SIEGES_INVALIDES'); end if;

  d := public.nzk_trip_detail(p_trip, p_from, p_to);
  if d is null or (d->>'price') is null or d->>'status' <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'DEPART_INDISPONIBLE');
  end if;
  if public.nzk_city_agency_count(p_to) > 0 then
    p_to_terminal := public.nzk_pick_agency(p_to, p_to_terminal);
    if p_to_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_ARRIVEE_A_CHOISIR'); end if;
  else
    p_to_terminal := null;
  end if;

  select count(*) into v_held from (
    select 1 from public.trip_seats
    where trip_id = p_trip and seat_number = any (v_seats) and status = 'hold' and hold_token = p_token and expires_at > now()
    for update
  ) h;
  if v_held <> v_count then return jsonb_build_object('ok', false, 'error', 'SIEGES_NON_BLOQUES'); end if;

  v_unit := (d->>'price')::int;
  select count(*) into v_premium from unnest(v_seats) s
  where public.nzk_seat_premium((d->'bus'->>'seats_per_row')::int, (d->'bus'->>'rows')::int, (d->'bus'->>'back_row_seats')::int, s);
  v_price := v_unit * v_count + v_premium * public.nzk_premium_supplement();

  v_board := ((d->>'date')::date + (d->>'departure_time')::time)
           + make_interval(mins => case when d->>'direction' = 'aller' then (d->>'from_offset')::int
                                        else (d->>'max_offset')::int - (d->>'from_offset')::int end);
  if v_board <= public.nzk_now() then return jsonb_build_object('ok', false, 'error', 'DEPART_PASSE'); end if;

  loop
    v_ref := 'NZK-' || to_char(public.nzk_now(), 'YYMMDD') || '-' ||
             (select string_agg(substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;

  insert into public.bookings (id, reference, trip_id, corridor_id, from_city, to_city, from_terminal, to_terminal,
                               date, departure_time, total_price, passenger_count, status, confirmed_at,
                               customer_phone, access_key, sale_channel)
  values (v_booking, v_ref, p_trip, d->>'corridor_id', p_from, p_to, p_from_terminal, p_to_terminal,
          v_board::date, to_char(v_board, 'HH24:MI'), v_price, v_count, 'confirmed', now(),
          nullif(trim(coalesce(p_customer_phone, '')), ''), v_key, 'guichet');

  for p in select * from jsonb_array_elements(p_passengers) loop
    insert into public.passengers (booking_id, full_name, phone, seat_number, is_primary)
    values (v_booking, trim(p->>'full_name'), nullif(trim(coalesce(p->>'phone', '')), ''), p->>'seat', i = 0);
    i := i + 1;
  end loop;

  insert into public.payments (booking_id, method, amount, status, confirmed_by, confirmed_at, agency_id, notes)
  values (v_booking, 'especes', v_price, 'confirmed', p_agent, now(), p_from_terminal, 'Vente au guichet — espèces');

  update public.trip_seats
  set status = 'booked', booking_id = v_booking, hold_token = null, hold_client = null, expires_at = null
  where trip_id = p_trip and seat_number = any (v_seats);

  for ps in select id from public.passengers where booking_id = v_booking loop
    loop
      v_code := upper(encode(gen_random_bytes(10), 'hex'));
      begin
        insert into public.tickets (booking_id, passenger_id, code) values (v_booking, ps.id, v_code);
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'reference', v_ref, 'access_key', v_key,
                            'total_price', v_price, 'tickets', v_n,
                            'agency_name', (select name from public.terminals where id = p_from_terminal));
end $$;

-- ------------------------------------------------------------
-- 8. Gestion d'un départ précis : bus, retard, annulation
-- ------------------------------------------------------------
create or replace function public.nzk_trip_can_manage(p_agent uuid, p_trip uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.nzk_agent(p_agent) a
                 where a.role = 'admin'
                    or (a.role = 'manager' and a.city_id = public.nzk_trip_end_city(p_trip, 'origine')));
$$;

create or replace function public.nzk_trip_manage(p_agent uuid, p_trip uuid, p_action text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  tr record; nb record; v_before jsonb; v_after jsonb; v_booked int; v_cap int; v_bad text[];
  v_delay int; v_reason text := nullif(trim(coalesce(p->>'reason', '')), ''); v_note text := nullif(trim(coalesce(p->>'note', '')), '');
begin
  if not public.nzk_trip_can_manage(p_agent, p_trip) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select t.*, coalesce(t.bus_id, sv.bus_id) as current_bus into tr
  from public.trips t join public.services sv on sv.id = t.service_id where t.id = p_trip for update of t;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  v_before := jsonb_build_object('status', tr.status, 'bus_id', tr.current_bus, 'delay_minutes', tr.delay_minutes, 'reason', tr.status_reason);

  case p_action
    when 'bus' then
      if tr.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'DEPART_ANNULE'); end if;
      select * into nb from public.buses where id = nullif(p->>'bus_id', '')::uuid and is_active;
      if not found then return jsonb_build_object('ok', false, 'error', 'BUS_INVALIDE'); end if;
      v_cap := nb.seats_per_row * (nb.rows - 1) + nb.back_row_seats;
      select count(*) into v_booked from public.trip_seats where trip_id = p_trip and status = 'booked';
      select coalesce(array_agg(seat_number order by seat_number), '{}') into v_bad from public.trip_seats
      where trip_id = p_trip and status = 'booked' and not public.nzk_seat_valid(nb.seats_per_row, nb.rows, nb.back_row_seats, seat_number);
      if v_booked > v_cap or array_length(v_bad, 1) > 0 then
        return jsonb_build_object('ok', false, 'error', 'BUS_INCOMPATIBLE', 'booked', v_booked, 'capacity', v_cap, 'seats', to_jsonb(v_bad));
      end if;
      -- Sièges en cours de choix qui n'existent pas dans le nouveau bus : libérés
      delete from public.trip_seats where trip_id = p_trip and status = 'hold'
        and not public.nzk_seat_valid(nb.seats_per_row, nb.rows, nb.back_row_seats, seat_number);
      update public.trips set bus_id = nb.id, status_note = coalesce(v_note, status_note),
             status_updated_at = now(), status_updated_by = p_agent where id = p_trip;
    when 'delay' then
      if tr.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'DEPART_ANNULE'); end if;
      v_delay := coalesce(nullif(p->>'delay_minutes', '')::int, -1);
      if v_delay < 0 or v_delay > 1440 then return jsonb_build_object('ok', false, 'error', 'RETARD_INVALIDE'); end if;
      update public.trips set delay_minutes = v_delay,
             status_reason = case when v_delay = 0 then null else v_reason end,
             status_note = case when v_delay = 0 then null else v_note end,
             status_updated_at = now(), status_updated_by = p_agent where id = p_trip;
    when 'cancel' then
      if tr.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'DEJA_ANNULE'); end if;
      if v_reason is null or length(v_reason) < 3 then return jsonb_build_object('ok', false, 'error', 'MOTIF_REQUIS'); end if;
      update public.trips set status = 'cancelled', status_reason = v_reason, status_note = v_note,
             status_updated_at = now(), status_updated_by = p_agent where id = p_trip;
      delete from public.trip_seats where trip_id = p_trip and status = 'hold';
    when 'reopen' then
      if tr.status <> 'cancelled' then return jsonb_build_object('ok', false, 'error', 'STATUT_INCOMPATIBLE'); end if;
      update public.trips set status = 'scheduled', status_reason = null, status_note = null,
             status_updated_at = now(), status_updated_by = p_agent where id = p_trip;
    else
      return jsonb_build_object('ok', false, 'error', 'ACTION_INCONNUE');
  end case;

  select jsonb_build_object('status', t.status, 'bus_id', coalesce(t.bus_id, sv.bus_id), 'delay_minutes', t.delay_minutes, 'reason', t.status_reason)
  into v_after from public.trips t join public.services sv on sv.id = t.service_id where t.id = p_trip;
  insert into public.trip_events (trip_id, action, before, after, note, agent_id)
  values (p_trip, p_action, v_before, v_after, coalesce(v_reason || coalesce(' — ' || v_note, ''), v_note), p_agent);
  return jsonb_build_object('ok', true, 'trip', v_after);
end $$;

-- Départs d'une ville (espace agents) : statut, retard, bus, remplissage
create or replace function public.nzk_city_departures(p_city text, p_date date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e record;
begin
  for e in
    select distinct x.city_id from public.corridor_stops me
    join public.corridor_stops x on x.corridor_id = me.corridor_id and x.city_id <> me.city_id
    where me.city_id = p_city
      and x.stop_order in ((select min(stop_order) from public.corridor_stops y where y.corridor_id = me.corridor_id),
                           (select max(stop_order) from public.corridor_stops y where y.corridor_id = me.corridor_id))
  loop
    perform 1 from public.nzk_get_departures(p_city, e.city_id, p_date);
  end loop;

  return coalesce((
    select jsonb_agg(s.d order by s.d->>'boarding_at')
    from (
      select jsonb_build_object(
        'trip_id', tr.id, 'direction', tr.direction, 'departure_time', tr.departure_time, 'date', tr.date,
        'corridor_label', c.label, 'bus_name', b.name, 'bus_id', b.id,
        'status', tr.status, 'delay_minutes', tr.delay_minutes, 'status_reason', tr.status_reason, 'status_note', tr.status_note,
        'seats_booked', (select count(*) from public.trip_seats ts where ts.trip_id = tr.id and ts.status = 'booked'),
        'capacity', b.seats_per_row * (b.rows - 1) + b.back_row_seats,
        'is_origin', me.stop_order = case when tr.direction = 'aller' then mx.min_o else mx.max_o end,
        'boarding_at', (tr.date + tr.departure_time::time) + make_interval(mins =>
            case when tr.direction = 'aller' then me.offset_minutes else mx.max_off - me.offset_minutes end),
        'terminus', (select ci.name from public.corridor_stops z join public.cities ci on ci.id = z.city_id
                     where z.corridor_id = sv.corridor_id
                     order by case when tr.direction = 'aller' then -z.stop_order else z.stop_order end limit 1),
        'passengers', (select count(*) from public.passengers ps join public.bookings bk on bk.id = ps.booking_id
                       where bk.trip_id = tr.id and bk.status in ('pending', 'confirmed') and bk.from_city = p_city),
        'parcels', (select count(*) from public.parcels pc where pc.trip_id = tr.id and pc.from_city = p_city
                    and pc.status in ('affecte', 'charge', 'en_transit')),
        'parcels_loaded', (select count(*) from public.parcels pc where pc.trip_id = tr.id and pc.from_city = p_city
                           and pc.status in ('charge', 'en_transit'))
      ) as d
      from public.trips tr
      join public.services sv on sv.id = tr.service_id and sv.is_active
      join public.corridors c on c.id = sv.corridor_id
      join public.corridor_stops me on me.corridor_id = sv.corridor_id and me.city_id = p_city
      join lateral (select max(offset_minutes) as max_off, min(stop_order) as min_o, max(stop_order) as max_o
                    from public.corridor_stops z where z.corridor_id = sv.corridor_id) mx on true
      left join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
      where tr.date = p_date and tr.status in ('scheduled', 'cancelled') and tr.departure_time = any (sv.departure_times)
        and not (tr.direction = 'aller' and me.stop_order = mx.max_o)
        and not (tr.direction = 'retour' and me.stop_order = mx.min_o)
    ) s), '[]'::jsonb);
end $$;

-- Contrôle à l'embarquement : un billet d'un départ annulé est refusé
create or replace function public.nzk_scan_ticket(p_code text, p_agent uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; tk record; v_today date := (public.nzk_now())::date; v_info jsonb;
begin
  if not exists (select 1 from public.agent_profiles where id = p_agent and is_active) then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Agent non autorisé.');
  end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '^.*:', ''));
  v_code := regexp_replace(v_code, '[^0-9A-F]', '', 'g');

  select t.*, bk.status as booking_status, bk.reference, bk.date, bk.departure_time, bk.from_city, bk.to_city,
         ps.full_name, ps.seat_number, tr.status as trip_status, tr.delay_minutes
  into tk
  from public.tickets t
  join public.bookings bk on bk.id = t.booking_id
  join public.passengers ps on ps.id = t.passenger_id
  left join public.trips tr on tr.id = bk.trip_id
  where t.code = v_code
  for update of t;

  if not found then
    insert into public.ticket_scans (code, result, scanned_by) values (left(v_code, 40), 'invalid', p_agent);
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Billet inconnu : ce QR code n''est pas un billet Nzoko valide.');
  end if;

  v_info := jsonb_build_object('reference', tk.reference, 'passenger', tk.full_name, 'seat', tk.seat_number,
    'from', coalesce((select name from public.cities where id = tk.from_city), tk.from_city),
    'to', coalesce((select name from public.cities where id = tk.to_city), tk.to_city),
    'date', tk.date, 'departure_time', tk.departure_time, 'used_at', tk.used_at, 'delay_minutes', coalesce(tk.delay_minutes, 0));

  if tk.status = 'cancelled' or tk.booking_status = 'cancelled' then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'cancelled', p_agent);
    return jsonb_build_object('ok', false, 'result', 'cancelled', 'message', 'Billet annulé.', 'ticket', v_info);
  end if;
  if tk.trip_status = 'cancelled' then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'trip_cancelled', p_agent);
    return jsonb_build_object('ok', false, 'result', 'trip_cancelled', 'message', 'Départ annulé : embarquement impossible sur ce départ.', 'ticket', v_info);
  end if;
  if tk.booking_status <> 'confirmed' then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'not_confirmed', p_agent);
    return jsonb_build_object('ok', false, 'result', 'not_confirmed', 'message', 'Paiement non confirmé.', 'ticket', v_info);
  end if;
  if tk.status = 'used' then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'already_used', p_agent);
    return jsonb_build_object('ok', false, 'result', 'already_used', 'message', 'Billet déjà utilisé.', 'ticket', v_info);
  end if;
  if tk.date <> v_today then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'wrong_date', p_agent);
    return jsonb_build_object('ok', false, 'result', 'wrong_date',
      'message', 'Ce billet est pour le ' || to_char(tk.date, 'DD/MM/YYYY') || ', pas pour aujourd''hui.', 'ticket', v_info);
  end if;

  update public.tickets set status = 'used', used_at = now(), used_by = p_agent where id = tk.id;
  insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'valid', p_agent);
  return jsonb_build_object('ok', true, 'result', 'valid', 'message', 'Billet valide. Embarquement autorisé.',
                            'ticket', v_info || jsonb_build_object('used_at', now()));
end $$;

-- ------------------------------------------------------------
-- 9. Billet public : rien sans la clé d'accès
-- ------------------------------------------------------------
create or replace function public.nzk_ticket_view(p_reference text, p_access_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record; tr record;
begin
  select * into bk from public.bookings where reference = upper(p_reference);
  if not found then return null; end if;
  if bk.access_key is null or p_access_key is null or bk.access_key <> p_access_key then
    return jsonb_build_object('reference', bk.reference, 'authorized', false);
  end if;
  select t.status, t.delay_minutes, t.status_reason, b.name as bus_name into tr
  from public.trips t join public.services sv on sv.id = t.service_id
  left join public.buses b on b.id = coalesce(t.bus_id, sv.bus_id) where t.id = bk.trip_id;
  return jsonb_build_object(
    'reference', bk.reference, 'status', bk.status, 'date', bk.date, 'departure_time', bk.departure_time,
    'from_city', bk.from_city, 'to_city', bk.to_city,
    'from_city_name', coalesce((select name from public.cities where id = bk.from_city), bk.from_city),
    'to_city_name', coalesce((select name from public.cities where id = bk.to_city), bk.to_city),
    'from_terminal_name', (select name from public.terminals where id = bk.from_terminal),
    'to_terminal_name', (select name from public.terminals where id = bk.to_terminal),
    'total_price', bk.total_price, 'passenger_count', bk.passenger_count,
    'authorized', true, 'sale_channel', bk.sale_channel,
    'trip_status', tr.status, 'delay_minutes', coalesce(tr.delay_minutes, 0), 'trip_status_reason', tr.status_reason,
    'bus_name', tr.bus_name,
    'passengers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', ps.full_name, 'seat_number', ps.seat_number, 'is_primary', ps.is_primary,
        'ticket_code', t.code, 'ticket_status', t.status) order by ps.is_primary desc, ps.seat_number)
      from public.passengers ps left join public.tickets t on t.passenger_id = ps.id
      where ps.booking_id = bk.id), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------
-- 10. « Mes réservations » : référence + téléphone, tentatives limitées
-- ------------------------------------------------------------
create or replace function public.nzk_booking_lookup(p_reference text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ref text := upper(trim(coalesce(p_reference, ''))); v_digits text := right(public.nzk_digits(p_phone), 9);
  v_keys text[]; bk record; k text; tr record;
begin
  if v_ref !~ '^NZK-\d{6}-[A-Z0-9]{4}$' or v_digits !~ '^0[56]\d{7}$' then
    return jsonb_build_object('ok', false, 'error', 'RECHERCHE_INVALIDE');
  end if;
  v_keys := array['tel:' || v_digits, 'ref:' || v_ref];
  if exists (select 1 from public.booking_lookup_attempts where key = any (v_keys) and locked_until > now()) then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_TENTATIVES');
  end if;

  select * into bk from public.bookings b
  where b.reference = v_ref
    and (right(public.nzk_digits(b.customer_phone), 9) = v_digits
         or exists (select 1 from public.passengers ps where ps.booking_id = b.id and right(public.nzk_digits(ps.phone), 9) = v_digits));

  if not found then
    foreach k in array v_keys loop
      insert into public.booking_lookup_attempts (key, failures, window_start) values (k, 1, now())
      on conflict (key) do update set
        failures = case when booking_lookup_attempts.window_start < now() - interval '1 hour' then 1 else booking_lookup_attempts.failures + 1 end,
        window_start = case when booking_lookup_attempts.window_start < now() - interval '1 hour' then now() else booking_lookup_attempts.window_start end,
        locked_until = case when booking_lookup_attempts.window_start >= now() - interval '1 hour' and booking_lookup_attempts.failures + 1 >= 8
                            then now() + interval '1 hour' else null end;
    end loop;
    return jsonb_build_object('ok', false, 'error', 'INTROUVABLE');
  end if;

  select t.status, t.delay_minutes, t.status_reason into tr from public.trips t where t.id = bk.trip_id;
  return jsonb_build_object('ok', true, 'booking', jsonb_build_object(
    'id', bk.id, 'reference', bk.reference, 'from_city', bk.from_city, 'to_city', bk.to_city,
    'from_city_name', coalesce((select name from public.cities where id = bk.from_city), bk.from_city),
    'to_city_name', coalesce((select name from public.cities where id = bk.to_city), bk.to_city),
    'from_terminal', bk.from_terminal, 'to_terminal', bk.to_terminal,
    'from_terminal_name', (select name from public.terminals where id = bk.from_terminal),
    'to_terminal_name', (select name from public.terminals where id = bk.to_terminal),
    'date', bk.date, 'departure_time', bk.departure_time, 'total_price', bk.total_price,
    'passenger_count', bk.passenger_count, 'status', bk.status, 'created_at', bk.created_at,
    'access_key', bk.access_key,
    'trip_status', tr.status, 'delay_minutes', coalesce(tr.delay_minutes, 0), 'trip_status_reason', tr.status_reason,
    'passengers', coalesce((select jsonb_agg(jsonb_build_object('full_name', ps.full_name, 'seat_number', ps.seat_number, 'is_primary', ps.is_primary)
                                             order by ps.is_primary desc, ps.seat_number)
                            from public.passengers ps where ps.booking_id = bk.id), '[]'::jsonb)));
end $$;

-- ------------------------------------------------------------
-- 11. Finance : espèces voyageurs, démonstration exclue des revenus
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
      'voyageurs', coalesce(v.total, 0), 'voyageurs_mtn', coalesce(v.mtn, 0), 'voyageurs_airtel', coalesce(v.airtel, 0),
      'voyageurs_especes', coalesce(v.especes, 0), 'voyageurs_count', coalesce(v.n, 0),
      'colis', coalesce(k.total, 0), 'colis_mtn', coalesce(k.mtn, 0), 'colis_airtel', coalesce(k.airtel, 0), 'colis_especes', coalesce(k.especes, 0), 'colis_count', coalesce(k.n, 0),
      'en_attente_count', coalesce(w.n, 0), 'en_attente_montant', coalesce(w.total, 0)
    ) order by c.name, t.name)
    from public.terminals t join public.cities c on c.id = t.city_id
    left join lateral (
      select sum(p.amount) total, sum(p.amount) filter (where p.method = 'mtn') mtn, sum(p.amount) filter (where p.method = 'airtel') airtel,
             sum(p.amount) filter (where p.method = 'especes') especes, count(*) n
      from public.payments p join public.bookings b on b.id = p.booking_id
      where coalesce(p.agency_id, b.from_terminal) = t.id and p.status = 'confirmed' and not b.is_demo
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
      where coalesce(p.agency_id, b.from_terminal) = t.id and p.status = 'pending' and not b.is_demo) w on true
    where a.role in ('admin', 'finance') or t.id = a.terminal_id), '[]'::jsonb),
    'non_attribues', case when a.role in ('admin', 'finance') then jsonb_build_object(
      'voyageurs', coalesce((select sum(p.amount) from public.payments p join public.bookings b on b.id = p.booking_id
                             where coalesce(p.agency_id, b.from_terminal) is null and p.status = 'confirmed' and not b.is_demo
                               and (p.confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
      'en_attente_count', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
                           where coalesce(p.agency_id, b.from_terminal) is null and p.status = 'pending' and not b.is_demo)) else null end);
end $$;

create or replace function public.nzk_revenue_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'voyageurs', coalesce((select sum(p.amount) from public.payments p join public.bookings b on b.id = p.booking_id
                           where p.status = 'confirmed' and not b.is_demo and (p.confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
    'voyageurs_count', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
                        where p.status = 'confirmed' and not b.is_demo and (p.confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to),
    'colis', coalesce((select sum(amount) from public.parcel_payments
                       where status = 'confirmed' and (collected_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
    'colis_count', (select count(*) from public.parcel_payments
                    where status = 'confirmed' and (collected_at at time zone 'Africa/Brazzaville')::date between p_from and p_to)
  );
$$;

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
      'expires_at', case when p.status = 'pending' then b.created_at + public.nzk_pending_ttl() end,
      'confirmed_by', (select full_name from public.agent_profiles where id = p.confirmed_by),
      'agency_id', coalesce(p.agency_id, b.from_terminal),
      'agency_name', (select name from public.terminals where id = coalesce(p.agency_id, b.from_terminal)),
      'account_number', (select number from public.agency_payment_accounts where id = p.account_id),
      'is_demo', b.is_demo, 'sale_channel', b.sale_channel,
      'from_city', (select name from public.cities where id = b.from_city), 'to_city', (select name from public.cities where id = b.to_city),
      'date', b.date, 'departure_time', b.departure_time, 'passenger_count', b.passenger_count,
      'customer_phone', b.customer_phone,
      'primary_passenger', (select full_name from public.passengers where booking_id = b.id order by is_primary desc limit 1)) as d
    from public.payments p join public.bookings b on b.id = p.booking_id
    where (p_status is null or p.status = p_status)
      and (a.role in ('admin', 'finance') or coalesce(p.agency_id, b.from_terminal) = a.terminal_id)
    order by p.created_at desc limit 200) s), '[]'::jsonb);
end $$;

-- Comptes : indicateur démonstration (lecture / enregistrement)
create or replace function public.nzk_payment_accounts(p_agent uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'terminal_id', x.terminal_id, 'terminal_name', t.name, 'city', c.name, 'provider', x.provider,
      'number', x.number, 'holder_name', x.holder_name, 'is_active', x.is_active, 'is_demo', x.is_demo, 'updated_at', x.updated_at,
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
    insert into public.agency_payment_accounts (terminal_id, provider, number, holder_name, is_active, is_demo, updated_by)
    values (p->>'terminal_id', p->>'provider', trim(p->>'number'), trim(p->>'holder_name'),
            coalesce((p->>'is_active')::boolean, true), coalesce((p->>'is_demo')::boolean, false), p_agent)
    returning id into v_id;
  else
    select to_jsonb(x) - 'updated_at' - 'updated_by' into v_before from public.agency_payment_accounts x where id = v_id;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
    update public.agency_payment_accounts set terminal_id = p->>'terminal_id', provider = p->>'provider', number = trim(p->>'number'),
           holder_name = trim(p->>'holder_name'), is_active = coalesce((p->>'is_active')::boolean, is_active),
           is_demo = coalesce((p->>'is_demo')::boolean, is_demo), updated_by = p_agent, updated_at = now()
    where id = v_id;
  end if;
  select to_jsonb(x) - 'updated_at' - 'updated_by' into v_after from public.agency_payment_accounts x where id = v_id;
  insert into public.agency_payment_account_changes (account_id, changed_by, before, after) values (v_id, p_agent, v_before, v_after);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ------------------------------------------------------------
-- 12. Tableau de bord : chiffres réels du périmètre de la personne connectée
-- ------------------------------------------------------------
create or replace function public.nzk_dashboard(p_agent uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_today date := (public.nzk_now())::date; v_central boolean;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  v_central := a.role in ('admin', 'finance');
  return jsonb_build_object(
    'role', a.role,
    'bookings_today', (select count(*) from public.bookings b
                       where (b.created_at at time zone 'Africa/Brazzaville')::date = v_today and b.status in ('pending', 'confirmed') and not b.is_demo
                         and (v_central or a.terminal_id in (b.from_terminal, b.to_terminal))),
    'pending_payments', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
                         where p.status = 'pending' and b.status = 'pending' and b.created_at > now() - public.nzk_pending_ttl()
                           and (v_central or coalesce(p.agency_id, b.from_terminal) = a.terminal_id)),
    'parcels_today', (select count(*) from public.parcels pc
                      where (pc.created_at at time zone 'Africa/Brazzaville')::date = v_today
                        and (v_central or a.terminal_id in (pc.from_terminal, pc.to_terminal))),
    'revenue_today', case when a.role in ('admin', 'finance', 'manager') then
        coalesce((select sum(p.amount) from public.payments p join public.bookings b on b.id = p.booking_id
                  where p.status = 'confirmed' and not b.is_demo and (p.confirmed_at at time zone 'Africa/Brazzaville')::date = v_today
                    and (v_central or coalesce(p.agency_id, b.from_terminal) = a.terminal_id)), 0)
      + coalesce((select sum(pp.amount) from public.parcel_payments pp
                  where pp.status = 'confirmed' and (pp.collected_at at time zone 'Africa/Brazzaville')::date = v_today
                    and (v_central or pp.terminal_id = a.terminal_id)), 0) end,
    'active_staff', case when a.role = 'admin' then (select count(*) from public.agent_profiles where is_active) end
  );
end $$;

-- Liste des réservations récentes du périmètre (onglet Réservations)
create or replace function public.nzk_recent_bookings(p_agent uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  return coalesce((select jsonb_agg(x.d order by x.d->>'departure_time', x.d->>'reference') from (
    select jsonb_build_object(
      'id', b.id, 'reference', b.reference, 'status', b.status, 'sale_channel', b.sale_channel, 'is_demo', b.is_demo,
      'from_city', (select name from public.cities where id = b.from_city), 'to_city', (select name from public.cities where id = b.to_city),
      'from_terminal', (select name from public.terminals where id = b.from_terminal),
      'to_terminal', (select name from public.terminals where id = b.to_terminal),
      'date', b.date, 'departure_time', b.departure_time, 'passenger_count', b.passenger_count, 'total_price', b.total_price,
      'seats', (select string_agg(ps.seat_number, ', ' order by ps.seat_number) from public.passengers ps where ps.booking_id = b.id),
      'primary_passenger', (select full_name from public.passengers where booking_id = b.id order by is_primary desc limit 1)) as d
    from public.bookings b
    where b.date = p_date and (a.role in ('admin', 'finance') or a.terminal_id in (b.from_terminal, b.to_terminal))
    limit 300) x), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------
-- 13. Droits d'exécution : serveur uniquement
-- ------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('nzk_pending_ttl', 'nzk_expire_booking', 'nzk_expire_pending', 'nzk_purge_holds', 'nzk_hold_seat',
                        'nzk_get_departures', 'nzk_trip_payment_info', 'nzk_create_booking', 'nzk_confirm_payment',
                        'nzk_counter_sale', 'nzk_trip_can_manage', 'nzk_trip_manage', 'nzk_city_departures', 'nzk_scan_ticket',
                        'nzk_ticket_view', 'nzk_booking_lookup', 'nzk_finance_report', 'nzk_revenue_summary',
                        'nzk_pending_payments', 'nzk_payment_accounts', 'nzk_payment_account_save', 'nzk_dashboard', 'nzk_recent_bookings')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;
