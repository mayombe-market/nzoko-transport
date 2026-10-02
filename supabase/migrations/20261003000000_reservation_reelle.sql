-- ============================================================
-- Nzoko Transport — Étape 3 : réservation réelle (3 octobre 2026)
--
-- Ajouts uniquement (aucune donnée existante modifiée ni supprimée) :
--  - trips : sens (aller/retour) + bus du départ ; la contrainte d'unicité
--    est étendue au sens (la table trips était vide).
--  - trip_seats : occupation des sièges par départ (blocage temporaire
--    puis vente). Clé primaire (trip_id, seat_number) = aucune double
--    réservation possible, même en cas d'appels simultanés.
--  - tickets : un billet par passager, code QR aléatoire (80 bits).
--  - ticket_scans : historique de tous les scans.
--  - bookings : clé d'accès secrète au billet + dates de confirmation/annulation.
--  - Fonctions nzk_* (SECURITY DEFINER) appelées uniquement par le serveur
--    (rôle service_role) : départs, plan de sièges, blocage, création de
--    réservation avec prix officiel, confirmation/rejet/annulation, scan.
--
-- Retour arrière : supabase/audit/retour-arriere-20261003.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tables et colonnes
-- ------------------------------------------------------------
alter table public.trips
  add column if not exists direction text not null default 'aller',
  add column if not exists bus_id uuid references public.buses(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trips_direction_check') then
    alter table public.trips add constraint trips_direction_check check (direction in ('aller', 'retour'));
  end if;
end $$;

-- La contrainte d'origine (service, date, heure) empêche d'avoir l'aller et le retour à la même heure.
alter table public.trips drop constraint if exists trips_service_id_date_departure_time_key;
create unique index if not exists trips_service_date_heure_sens_key
  on public.trips (service_id, date, departure_time, direction);

alter table public.bookings
  add column if not exists access_key text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz;
create unique index if not exists bookings_access_key_key on public.bookings (access_key) where access_key is not null;
create index if not exists bookings_trip_id_idx on public.bookings (trip_id);
create index if not exists passengers_booking_id_idx on public.passengers (booking_id);
create index if not exists payments_booking_id_idx on public.payments (booking_id);

create table if not exists public.trip_seats (
  trip_id     uuid not null references public.trips(id) on delete cascade,
  seat_number text not null,
  status      text not null check (status in ('hold', 'booked')),
  hold_token  text,
  booking_id  uuid references public.bookings(id) on delete cascade,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  primary key (trip_id, seat_number),
  check ((status = 'hold' and hold_token is not null and expires_at is not null)
      or (status = 'booked' and booking_id is not null))
);
create index if not exists trip_seats_booking_idx on public.trip_seats (booking_id);

create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  passenger_id uuid not null unique references public.passengers(id) on delete cascade,
  code         text not null unique,
  status       text not null default 'valid' check (status in ('valid', 'used', 'cancelled')),
  used_at      timestamptz,
  used_by      uuid references public.agent_profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists tickets_booking_idx on public.tickets (booking_id);

create table if not exists public.ticket_scans (
  id          bigserial primary key,
  ticket_id   uuid references public.tickets(id) on delete set null,
  code        text,
  result      text not null check (result in ('valid', 'already_used', 'invalid', 'not_confirmed', 'cancelled', 'wrong_date')),
  scanned_by  uuid references public.agent_profiles(id) on delete set null,
  scanned_at  timestamptz not null default now()
);
create index if not exists ticket_scans_ticket_idx on public.ticket_scans (ticket_id);

-- RLS : aucune lecture/écriture directe depuis le navigateur, sauf lecture agents
alter table public.trip_seats   enable row level security;
alter table public.tickets      enable row level security;
alter table public.ticket_scans enable row level security;
revoke all on public.trip_seats, public.tickets, public.ticket_scans from anon;
revoke insert, update, delete, truncate, references, trigger on public.trip_seats, public.tickets, public.ticket_scans from authenticated;
revoke all on sequence public.ticket_scans_id_seq from anon, authenticated;

drop policy if exists "agents_lisent_sieges" on public.trip_seats;
create policy "agents_lisent_sieges" on public.trip_seats for select to authenticated using (public.is_active_agent());
drop policy if exists "agents_lisent_billets" on public.tickets;
create policy "agents_lisent_billets" on public.tickets for select to authenticated using (public.is_active_agent());
drop policy if exists "agents_lisent_scans" on public.ticket_scans;
create policy "agents_lisent_scans" on public.ticket_scans for select to authenticated using (public.is_active_agent());

-- ------------------------------------------------------------
-- 2. Règles métier de base
-- ------------------------------------------------------------

-- Supplément place premium (FCFA) : un seul endroit à modifier
create or replace function public.nzk_premium_supplement()
returns integer language sql immutable as $$ select 1000 $$;

-- Heure locale (Congo-Brazzaville, UTC+1)
create or replace function public.nzk_now()
returns timestamp language sql stable as $$ select now() at time zone 'Africa/Brazzaville' $$;

-- Siège valide pour ce bus ? Format « A1 » : lettre = colonne, nombre = rangée.
-- Rangées 1..rows-1 : seats_per_row places ; dernière rangée (banquette) : back_row_seats places.
create or replace function public.nzk_seat_valid(p_spr int, p_rows int, p_back int, p_seat text)
returns boolean language plpgsql immutable as $$
declare v_col int; v_row int;
begin
  if p_seat is null or p_seat !~ '^[A-Z][0-9]{1,2}$' then return false; end if;
  v_col := ascii(left(p_seat, 1)) - 65;
  v_row := substr(p_seat, 2)::int;
  if v_row between 1 and p_rows - 1 then return v_col < p_spr; end if;
  if v_row = p_rows then return v_col < p_back; end if;
  return false;
end $$;

-- Siège premium ? Fenêtres (première et dernière colonne) + rangée 1 côté droit (derrière le chauffeur).
create or replace function public.nzk_seat_premium(p_spr int, p_rows int, p_back int, p_seat text)
returns boolean language plpgsql immutable as $$
declare v_col int; v_row int; v_last int;
begin
  if not public.nzk_seat_valid(p_spr, p_rows, p_back, p_seat) then return false; end if;
  v_col := ascii(left(p_seat, 1)) - 65;
  v_row := substr(p_seat, 2)::int;
  v_last := case when v_row = p_rows then p_back - 1 else p_spr - 1 end;
  return v_col = 0 or v_col = v_last or (v_row = 1 and v_col >= p_spr / 2);
end $$;

-- Prix officiel d'un tronçon (FCFA) d'après les arrêts du corridor, dans les deux sens
create or replace function public.nzk_segment_price(p_corridor text, p_from text, p_to text)
returns integer language sql stable as $$
  select abs(t.price_from_start - f.price_from_start)
  from public.corridor_stops f
  join public.corridor_stops t on t.corridor_id = f.corridor_id
  where f.corridor_id = p_corridor and f.city_id = p_from and t.city_id = p_to and p_from <> p_to
$$;

-- Libère les blocages expirés d'un départ
create or replace function public.nzk_purge_holds(p_trip uuid)
returns void language sql security definer set search_path = public, extensions as $$
  delete from public.trip_seats where trip_id = p_trip and status = 'hold' and expires_at < now();
$$;

-- ------------------------------------------------------------
-- 3. Départs disponibles pour une recherche (crée les départs du jour à la demande)
-- ------------------------------------------------------------
create or replace function public.nzk_get_departures(p_from text, p_to text, p_date date)
returns table (
  trip_id uuid, corridor_id text, corridor_label text, direction text,
  boarding_at timestamp, arrival_at timestamp, duration_min int, distance_km int,
  price int, premium_supplement int,
  bus_name text, bus_type text, amenities text[], seats_total int, seats_taken int
)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  s record; t text; v_dir text;
begin
  if p_date is null or p_date < (public.nzk_now())::date or p_from = p_to then return; end if;

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
    select tr.id, tr.direction, tr.date, tr.departure_time, sv.corridor_id, c.label,
           b.name, b.bus_type, b.amenities, b.seats_per_row, b.rows, b.back_row_seats,
           f.offset_minutes as f_off, f.distance_km as f_km, tt.offset_minutes as t_off, tt.distance_km as t_km,
           (select max(offset_minutes) from public.corridor_stops x where x.corridor_id = sv.corridor_id) as max_off
    from public.trips tr
    join public.services sv on sv.id = tr.service_id and sv.is_active
    join public.corridors c on c.id = sv.corridor_id
    join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
    join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
    join public.corridor_stops tt on tt.corridor_id = sv.corridor_id and tt.city_id = p_to
    where tr.date = p_date and tr.status = 'scheduled'
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
           where ts.trip_id = tm.id and (ts.status = 'booked' or ts.expires_at > now()))
  from timed tm
  where tm.b_at > public.nzk_now()
  order by tm.b_at;
end $$;

-- ------------------------------------------------------------
-- 4. Détail d'un départ pour le plan de sièges
-- ------------------------------------------------------------
create or replace function public.nzk_trip_detail(p_trip uuid, p_from text, p_to text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb; v_max int;
begin
  perform public.nzk_purge_holds(p_trip);
  select jsonb_build_object(
    'trip_id', tr.id, 'date', tr.date, 'departure_time', tr.departure_time, 'direction', tr.direction,
    'status', tr.status, 'corridor_id', sv.corridor_id, 'corridor_label', c.label,
    'bus', jsonb_build_object('name', b.name, 'type', b.bus_type, 'seats_per_row', b.seats_per_row,
                              'rows', b.rows, 'back_row_seats', b.back_row_seats, 'amenities', b.amenities),
    'price', public.nzk_segment_price(sv.corridor_id, p_from, p_to),
    'premium_supplement', public.nzk_premium_supplement(),
    'from_offset', f.offset_minutes, 'to_offset', tt.offset_minutes,
    'max_offset', (select max(offset_minutes) from public.corridor_stops x where x.corridor_id = sv.corridor_id),
    'from_order', f.stop_order, 'to_order', tt.stop_order,
    'taken', coalesce((select jsonb_agg(ts.seat_number) from public.trip_seats ts
                       where ts.trip_id = tr.id and (ts.status = 'booked' or ts.expires_at > now())), '[]'::jsonb)
  ) into v
  from public.trips tr
  join public.services sv on sv.id = tr.service_id
  join public.corridors c on c.id = sv.corridor_id
  join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
  join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
  join public.corridor_stops tt on tt.corridor_id = sv.corridor_id and tt.city_id = p_to
  where tr.id = p_trip;
  return v;  -- null si départ inconnu ou tronçon hors corridor
end $$;

-- ------------------------------------------------------------
-- 5. Blocage temporaire d'un siège (15 min, renouvelable par le même client)
-- ------------------------------------------------------------
create or replace function public.nzk_hold_seat(p_trip uuid, p_seat text, p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare b record; v_exp timestamptz := now() + interval '15 minutes'; v_count int; v_ok text;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'TOKEN_INVALIDE');
  end if;
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

  insert into public.trip_seats (trip_id, seat_number, status, hold_token, expires_at)
  values (p_trip, p_seat, 'hold', p_token, v_exp)
  on conflict (trip_id, seat_number) do update
    set hold_token = excluded.hold_token, expires_at = excluded.expires_at, created_at = now()
    where public.trip_seats.status = 'hold'
      and (public.trip_seats.expires_at < now() or public.trip_seats.hold_token = excluded.hold_token)
  returning seat_number into v_ok;

  if v_ok is null then
    return jsonb_build_object('ok', false, 'error', 'SIEGE_PRIS');
  end if;
  return jsonb_build_object('ok', true, 'seat', p_seat, 'expires_at', v_exp);
end $$;

create or replace function public.nzk_release_seat(p_trip uuid, p_seat text, p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from public.trip_seats
  where trip_id = p_trip and seat_number = p_seat and status = 'hold' and hold_token = p_token;
$$;

-- ------------------------------------------------------------
-- 6. Création de la réservation : sièges bloqués + prix officiel + paiement déclaré
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
  if p_from_terminal is not null and not exists (select 1 from public.terminals where id = p_from_terminal and city_id = p_from) then p_from_terminal := null; end if;
  if p_to_terminal is not null and not exists (select 1 from public.terminals where id = p_to_terminal and city_id = p_to) then p_to_terminal := null; end if;

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

  insert into public.payments (booking_id, method, amount, transaction_code, phone_sender, status)
  values (v_booking, p_method, v_price, trim(p_transaction_code), trim(p_phone_sender), 'pending');

  update public.trip_seats
  set status = 'booked', booking_id = v_booking, hold_token = null, expires_at = null
  where trip_id = p_trip and seat_number = any (v_seats);

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'reference', v_ref, 'access_key', v_key,
                            'total_price', v_price, 'unit_price', v_unit, 'premium_seats', v_premium);
end $$;

-- ------------------------------------------------------------
-- 7. Agents : confirmer / rejeter un paiement, annuler une réservation
-- ------------------------------------------------------------
create or replace function public.nzk_agent_can_handle(p_agent uuid, p_booking uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.agent_profiles a, public.bookings bk
    where a.id = p_agent and a.is_active and bk.id = p_booking
      and (a.role = 'admin' or a.terminal_id is null or bk.from_terminal is null or bk.from_terminal = a.terminal_id)
  );
$$;

create or replace function public.nzk_confirm_payment(p_booking uuid, p_agent uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record; v_pay uuid; v_n int := 0; ps record; v_code text;
begin
  if not public.nzk_agent_can_handle(p_agent, p_booking) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into bk from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if bk.status = 'confirmed' then return jsonb_build_object('ok', false, 'error', 'DEJA_CONFIRMEE'); end if;
  if bk.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'STATUT_INCOMPATIBLE'); end if;

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
        null; -- code déjà pris (quasi impossible) : on recommence
      end;
    end loop;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reference', bk.reference, 'tickets', v_n);
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
  return jsonb_build_object('ok', true, 'reference', bk.reference, 'was_paid', bk.status = 'confirmed');
end $$;

-- ------------------------------------------------------------
-- 8. Scan d'un billet : une seule validation, historique complet
-- ------------------------------------------------------------
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
         ps.full_name, ps.seat_number
  into tk
  from public.tickets t
  join public.bookings bk on bk.id = t.booking_id
  join public.passengers ps on ps.id = t.passenger_id
  where t.code = v_code
  for update of t;

  if not found then
    insert into public.ticket_scans (code, result, scanned_by) values (left(v_code, 40), 'invalid', p_agent);
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Billet inconnu : ce QR code n''est pas un billet Nzoko valide.');
  end if;

  v_info := jsonb_build_object('reference', tk.reference, 'passenger', tk.full_name, 'seat', tk.seat_number,
    'from', coalesce((select name from public.cities where id = tk.from_city), tk.from_city),
    'to', coalesce((select name from public.cities where id = tk.to_city), tk.to_city),
    'date', tk.date, 'departure_time', tk.departure_time, 'used_at', tk.used_at);

  if tk.status = 'cancelled' or tk.booking_status = 'cancelled' then
    insert into public.ticket_scans (ticket_id, code, result, scanned_by) values (tk.id, v_code, 'cancelled', p_agent);
    return jsonb_build_object('ok', false, 'result', 'cancelled', 'message', 'Billet annulé.', 'ticket', v_info);
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
-- 9. Données d'un billet pour la page publique / PDF (clé d'accès obligatoire pour les QR)
-- ------------------------------------------------------------
create or replace function public.nzk_ticket_view(p_reference text, p_access_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare bk record; v_auth boolean;
begin
  select * into bk from public.bookings where reference = upper(p_reference);
  if not found then return null; end if;
  v_auth := bk.access_key is not null and p_access_key is not null and bk.access_key = p_access_key;
  return jsonb_build_object(
    'reference', bk.reference, 'status', bk.status, 'date', bk.date, 'departure_time', bk.departure_time,
    'from_city', bk.from_city, 'to_city', bk.to_city,
    'from_city_name', coalesce((select name from public.cities where id = bk.from_city), bk.from_city),
    'to_city_name', coalesce((select name from public.cities where id = bk.to_city), bk.to_city),
    'from_terminal_name', (select name from public.terminals where id = bk.from_terminal),
    'to_terminal_name', (select name from public.terminals where id = bk.to_terminal),
    'total_price', bk.total_price, 'passenger_count', bk.passenger_count,
    'authorized', v_auth,
    'bus_name', (select b.name from public.trips tr join public.buses b on b.id = tr.bus_id where tr.id = bk.trip_id),
    'passengers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', ps.full_name, 'seat_number', ps.seat_number, 'is_primary', ps.is_primary,
        'ticket_code', case when v_auth then t.code end,
        'ticket_status', t.status) order by ps.is_primary desc, ps.seat_number)
      from public.passengers ps left join public.tickets t on t.passenger_id = ps.id
      where ps.booking_id = bk.id), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------
-- 10. Droits : fonctions réservées au serveur (service_role)
-- ------------------------------------------------------------
revoke all on function
  public.nzk_purge_holds(uuid), public.nzk_get_departures(text, text, date), public.nzk_trip_detail(uuid, text, text),
  public.nzk_hold_seat(uuid, text, text), public.nzk_release_seat(uuid, text, text),
  public.nzk_create_booking(uuid, text, text, text, text, text, jsonb, text, text, text, text, text),
  public.nzk_agent_can_handle(uuid, uuid), public.nzk_confirm_payment(uuid, uuid),
  public.nzk_reject_payment(uuid, uuid, text), public.nzk_cancel_booking(uuid, uuid, text),
  public.nzk_scan_ticket(text, uuid), public.nzk_ticket_view(text, text)
from public, anon, authenticated;

grant execute on function
  public.nzk_purge_holds(uuid), public.nzk_get_departures(text, text, date), public.nzk_trip_detail(uuid, text, text),
  public.nzk_hold_seat(uuid, text, text), public.nzk_release_seat(uuid, text, text),
  public.nzk_create_booking(uuid, text, text, text, text, text, jsonb, text, text, text, text, text),
  public.nzk_agent_can_handle(uuid, uuid), public.nzk_confirm_payment(uuid, uuid),
  public.nzk_reject_payment(uuid, uuid, text), public.nzk_cancel_booking(uuid, uuid, text),
  public.nzk_scan_ticket(text, uuid), public.nzk_ticket_view(text, text)
to service_role;

commit;
