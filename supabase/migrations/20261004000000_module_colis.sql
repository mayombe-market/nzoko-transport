-- ============================================================
-- Nzoko Transport — Module colis (4 octobre 2026)
--
-- Agence de départ → bus Nzoko → agence d'arrivée → retrait par le destinataire.
-- Indépendant des réservations voyageurs. Ajouts uniquement.
--
-- Réutilise : terminals (agences), agent_profiles.terminal_id (droits),
-- trips (départs réels), nzk_segment_price (tarif du tronçon), nzk_now().
--
-- Tables : parcel_categories (tarifs), parcels, parcel_events (historique),
--          parcel_payments (encaissements).
-- Fonctions nzk_parcel_* : réservées au serveur (service_role).
-- Retour arrière : supabase/audit/retour-arriere-20261004.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
create table if not exists public.parcel_categories (
  id              text primary key,
  label           text not null,
  fare_percent    integer not null default 0 check (fare_percent between 0 and 500),  -- % du tarif voyageur du tronçon
  min_price       integer not null default 0 check (min_price >= 0),                   -- FCFA, par colis
  price_per_kg    integer not null default 0 check (price_per_kg >= 0),                -- FCFA par kg (catégories au poids)
  requires_weight boolean not null default false,
  max_weight_kg   numeric(7,2),                                                         -- par colis
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- Tarifs PROVISOIRES (modifiables par un admin dans Admin → Colis → Tarifs)
insert into public.parcel_categories (id, label, fare_percent, min_price, price_per_kg, requires_weight, max_weight_kg, sort_order) values
  ('enveloppe', 'Enveloppe / documents',     15, 1000,   0, false,  1, 1),
  ('petit',     'Petit colis (jusqu''à 5 kg)', 30, 2000,   0, false,  5, 2),
  ('moyen',     'Colis moyen (jusqu''à 20 kg)', 50, 3000,   0, false, 20, 3),
  ('gros',      'Gros colis (jusqu''à 50 kg)', 80, 5000,   0, false, 50, 4),
  ('kilo',      'Marchandise au kilo',          0, 2000, 150, true, null, 5)
on conflict (id) do nothing;

create table if not exists public.parcels (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  qr_code               text not null unique,
  pickup_code_hash      text not null,
  pickup_failed_attempts integer not null default 0,
  pickup_locked_until   timestamptz,
  track_failed_attempts integer not null default 0,
  track_locked_until    timestamptz,

  sender_name           text not null,
  sender_phone          text not null,
  recipient_name        text not null,
  recipient_phone       text not null,

  from_city             text not null references public.cities(id),
  from_terminal         text not null references public.terminals(id),
  to_city               text not null references public.cities(id),
  to_terminal           text not null references public.terminals(id),

  category_id           text not null references public.parcel_categories(id),
  description           text not null,
  quantity              integer not null default 1 check (quantity between 1 and 100),
  weight_kg             numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  declared_value        integer check (declared_value is null or declared_value >= 0),
  notes                 text,

  price                 integer not null check (price >= 0),
  payer                 text not null check (payer in ('expediteur', 'destinataire')),
  payment_status        text not null check (payment_status in ('paye', 'a_payer')),

  status                text not null default 'depose' check (status in
                          ('depose', 'affecte', 'charge', 'en_transit', 'arrive', 'pret_au_retrait', 'retire', 'annule', 'incident')),
  trip_id               uuid references public.trips(id) on delete set null,

  created_by            uuid references public.agent_profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  picked_up_at          timestamptz,
  picked_up_by          uuid references public.agent_profiles(id) on delete set null,
  check (from_city <> to_city)
);
create index if not exists parcels_status_idx on public.parcels (status);
create index if not exists parcels_trip_idx on public.parcels (trip_id);
create index if not exists parcels_from_terminal_idx on public.parcels (from_terminal, created_at);
create index if not exists parcels_to_terminal_idx on public.parcels (to_terminal, status);
create index if not exists parcels_sender_phone_idx on public.parcels (sender_phone);
create index if not exists parcels_recipient_phone_idx on public.parcels (recipient_phone);

create table if not exists public.parcel_events (
  id          bigserial primary key,
  parcel_id   uuid not null references public.parcels(id) on delete cascade,
  from_status text,
  to_status   text not null,
  action      text not null,
  agent_id    uuid references public.agent_profiles(id) on delete set null,
  terminal_id text references public.terminals(id) on delete set null,
  trip_id     uuid references public.trips(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists parcel_events_parcel_idx on public.parcel_events (parcel_id, id);

create table if not exists public.parcel_payments (
  id               uuid primary key default gen_random_uuid(),
  parcel_id        uuid not null references public.parcels(id) on delete cascade,
  amount           integer not null check (amount >= 0),
  method           text not null check (method in ('especes', 'mtn', 'airtel')),
  transaction_code text,
  moment           text not null check (moment in ('depot', 'retrait')),
  collected_by     uuid references public.agent_profiles(id) on delete set null,
  terminal_id      text references public.terminals(id) on delete set null,
  status           text not null default 'confirmed' check (status in ('confirmed', 'refunded')),
  collected_at     timestamptz not null default now()
);
create index if not exists parcel_payments_parcel_idx on public.parcel_payments (parcel_id);
create index if not exists parcel_payments_date_idx on public.parcel_payments (collected_at);

-- RLS : aucun accès direct depuis le navigateur (tout passe par le serveur)
alter table public.parcel_categories enable row level security;
alter table public.parcels           enable row level security;
alter table public.parcel_events     enable row level security;
alter table public.parcel_payments   enable row level security;
revoke all on public.parcel_categories, public.parcels, public.parcel_events, public.parcel_payments from anon, authenticated;
revoke all on sequence public.parcel_events_id_seq from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Outils
-- ------------------------------------------------------------
create or replace function public.nzk_digits(p text)
returns text language sql immutable as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Agent actif + son agence
create or replace function public.nzk_agent(p_agent uuid)
returns table (id uuid, role text, terminal_id text, city_id text)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.role, a.terminal_id, t.city_id
  from public.agent_profiles a left join public.terminals t on t.id = a.terminal_id
  where a.id = p_agent and a.is_active and a.role in ('admin', 'agent');
$$;

-- Un agent « couvre » une agence s'il est admin, sans agence assignée, ou assigné à cette agence
create or replace function public.nzk_agent_covers(p_agent uuid, p_terminal text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.nzk_agent(p_agent) a
                 where a.role = 'admin' or a.terminal_id is null or a.terminal_id = p_terminal);
$$;

-- Tarif officiel d'un colis (FCFA) : null si le trajet n'est pas desservi
create or replace function public.nzk_parcel_price(p_category text, p_from text, p_to text, p_weight numeric, p_quantity int)
returns integer language plpgsql stable security definer set search_path = public, extensions as $$
declare c record; v_fare int; v_unit int;
begin
  select * into c from public.parcel_categories where id = p_category and is_active;
  if not found then return null; end if;
  select min(public.nzk_segment_price(f.corridor_id, p_from, p_to)) into v_fare
  from public.corridor_stops f join public.corridors co on co.id = f.corridor_id and co.is_active
  where f.city_id = p_from
    and exists (select 1 from public.corridor_stops t where t.corridor_id = f.corridor_id and t.city_id = p_to);
  if v_fare is null then return null; end if;

  v_unit := round(v_fare * c.fare_percent / 100.0 / 100.0) * 100;  -- arrondi à 100 FCFA
  if c.requires_weight then
    return greatest(c.min_price, v_unit + ceil(coalesce(p_weight, 0) * c.price_per_kg)::int);
  end if;
  return greatest(c.min_price, v_unit + ceil(coalesce(p_weight, 0) / greatest(p_quantity, 1) * c.price_per_kg)::int) * greatest(p_quantity, 1);
end $$;

create or replace function public.nzk_parcel_quote(p_category text, p_from text, p_to text, p_weight numeric, p_quantity int)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare c record; v_price int;
begin
  select * into c from public.parcel_categories where id = p_category and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'CATEGORIE_INVALIDE'); end if;
  if c.requires_weight and coalesce(p_weight, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'POIDS_REQUIS'); end if;
  if c.max_weight_kg is not null and coalesce(p_weight, 0) > c.max_weight_kg * greatest(p_quantity, 1) then
    return jsonb_build_object('ok', false, 'error', 'POIDS_TROP_ELEVE');
  end if;
  v_price := public.nzk_parcel_price(p_category, p_from, p_to, p_weight, p_quantity);
  if v_price is null then return jsonb_build_object('ok', false, 'error', 'TRAJET_NON_DESSERVI'); end if;
  return jsonb_build_object('ok', true, 'price', v_price);
end $$;

-- Journalise un changement de statut
create or replace function public.nzk_parcel_log(p_parcel uuid, p_from text, p_to text, p_action text, p_agent uuid, p_terminal text, p_trip uuid, p_note text)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.parcel_events (parcel_id, from_status, to_status, action, agent_id, terminal_id, trip_id, note)
  values (p_parcel, p_from, p_to, p_action, p_agent, p_terminal, p_trip, nullif(trim(coalesce(p_note, '')), ''));
$$;

create or replace function public.nzk_new_pickup_code()
returns text language sql volatile security definer set search_path = public, extensions as $$
  select lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;

-- ------------------------------------------------------------
-- 3. Dépôt d'un colis au guichet
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. Départs possibles pour un colis (crée les départs du jour si besoin)
-- ------------------------------------------------------------
create or replace function public.nzk_parcel_trip_options(p_parcel uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record;
begin
  select * into pc from public.parcels where id = p_parcel;
  if not found then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('trip_id', d.trip_id, 'boarding_at', d.boarding_at, 'arrival_at', d.arrival_at,
                                        'bus_name', d.bus_name, 'corridor_label', d.corridor_label) order by d.boarding_at)
    from public.nzk_get_departures(pc.from_city, pc.to_city, p_date) d), '[]'::jsonb);
end $$;

-- Le départ dessert-il ce colis (bon corridor, bon sens, pas parti) ?
create or replace function public.nzk_trip_serves(p_trip uuid, p_from text, p_to text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.trips tr
    join public.services sv on sv.id = tr.service_id
    join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
    join public.corridor_stops t on t.corridor_id = sv.corridor_id and t.city_id = p_to
    where tr.id = p_trip and tr.status = 'scheduled' and tr.date >= (public.nzk_now())::date
      and tr.direction = case when f.stop_order < t.stop_order then 'aller' else 'retour' end
  );
$$;

-- ------------------------------------------------------------
-- 5. Machine d'état (transitions contrôlées + droits par agence)
-- ------------------------------------------------------------
create or replace function public.nzk_parcel_transition(p_agent uuid, p_parcel uuid, p_action text, p_trip uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  pc record; a record; v_new text; v_term text; v_prev text; v_origin boolean; v_dest boolean;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into pc from public.parcels where id = p_parcel for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;

  v_origin := public.nzk_agent_covers(p_agent, pc.from_terminal);
  v_dest := public.nzk_agent_covers(p_agent, pc.to_terminal);

  case p_action
    when 'assign' then
      if pc.status not in ('depose', 'affecte') then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      if p_trip is null or not public.nzk_trip_serves(p_trip, pc.from_city, pc.to_city) then
        return jsonb_build_object('ok', false, 'error', 'DEPART_INVALIDE');
      end if;
      v_new := 'affecte'; v_term := pc.from_terminal;
    when 'unassign' then
      if pc.status <> 'affecte' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'depose'; v_term := pc.from_terminal; p_trip := null;
    when 'load' then
      if pc.status <> 'affecte' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'charge'; v_term := pc.from_terminal; p_trip := pc.trip_id;
    when 'unload' then
      if pc.status <> 'charge' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'affecte'; v_term := pc.from_terminal; p_trip := pc.trip_id;
    when 'depart' then
      if pc.status <> 'charge' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'en_transit'; v_term := pc.from_terminal; p_trip := pc.trip_id;
    when 'arrive' then
      if pc.status <> 'en_transit' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_dest then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'arrive'; v_term := pc.to_terminal; p_trip := pc.trip_id;
    when 'ready' then
      if pc.status <> 'arrive' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_dest then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      v_new := 'pret_au_retrait'; v_term := pc.to_terminal; p_trip := pc.trip_id;
    when 'cancel' then
      if pc.status not in ('depose', 'affecte') then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not v_origin then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      if length(trim(coalesce(p_note, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'MOTIF_REQUIS'); end if;
      v_new := 'annule'; v_term := pc.from_terminal; p_trip := pc.trip_id;
    when 'incident' then
      if pc.status in ('retire', 'annule', 'incident') then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not (v_origin or v_dest) then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      if length(trim(coalesce(p_note, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'MOTIF_REQUIS'); end if;
      v_new := 'incident'; v_term := coalesce(a.terminal_id, pc.from_terminal); p_trip := pc.trip_id;
    when 'resolve' then
      if pc.status <> 'incident' then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
      if not (v_origin or v_dest) then return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE'); end if;
      select e.from_status into v_prev from public.parcel_events e
      where e.parcel_id = p_parcel and e.to_status = 'incident' order by e.id desc limit 1;
      v_new := coalesce(v_prev, 'depose'); v_term := coalesce(a.terminal_id, pc.from_terminal); p_trip := pc.trip_id;
    else
      return jsonb_build_object('ok', false, 'error', 'ACTION_INCONNUE');
  end case;

  update public.parcels
  set status = v_new,
      trip_id = case when p_action in ('assign', 'unassign') then p_trip else trip_id end,
      updated_at = now()
  where id = p_parcel;

  if p_action = 'cancel' and pc.payment_status = 'paye' then
    p_note := p_note || ' — colis déjà payé : remboursement à traiter';
  end if;
  perform public.nzk_parcel_log(p_parcel, pc.status, v_new, p_action, p_agent, v_term, p_trip, p_note);
  return jsonb_build_object('ok', true, 'reference', pc.reference, 'status', v_new);
end $$;

-- Réception à l'agence d'arrivée : arrivé + prêt au retrait en une fois (deux événements)
create or replace function public.nzk_parcel_receive(p_agent uuid, p_parcel uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := public.nzk_parcel_transition(p_agent, p_parcel, 'arrive', null, null);
  if not (r->>'ok')::boolean then return r; end if;
  return public.nzk_parcel_transition(p_agent, p_parcel, 'ready', null, null);
end $$;

-- Départ du bus : tous les colis chargés de ce départ (et de l'agence de l'agent) passent en transit
create or replace function public.nzk_trip_depart_parcels(p_agent uuid, p_trip uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record; n int := 0; r jsonb;
begin
  if not exists (select 1 from public.nzk_agent(p_agent)) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  for pc in select id, from_terminal from public.parcels where trip_id = p_trip and status = 'charge' loop
    if public.nzk_agent_covers(p_agent, pc.from_terminal) then
      r := public.nzk_parcel_transition(p_agent, pc.id, 'depart', null, null);
      if (r->>'ok')::boolean then n := n + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- ------------------------------------------------------------
-- 6. Retrait : QR + code secret + (paiement si port dû)
-- ------------------------------------------------------------
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

-- Régénération du code (perdu / bloqué) : agence de départ ou d'arrivée, avec motif
create or replace function public.nzk_parcel_reset_code(p_agent uuid, p_parcel uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record; v_code text;
begin
  if not exists (select 1 from public.nzk_agent(p_agent)) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  select * into pc from public.parcels where id = p_parcel for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if pc.status in ('retire', 'annule') then return jsonb_build_object('ok', false, 'error', 'TRANSITION_INTERDITE'); end if;
  if not (public.nzk_agent_covers(p_agent, pc.from_terminal) or public.nzk_agent_covers(p_agent, pc.to_terminal)) then
    return jsonb_build_object('ok', false, 'error', 'AGENCE_NON_AUTORISEE');
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'MOTIF_REQUIS'); end if;
  v_code := public.nzk_new_pickup_code();
  update public.parcels set pickup_code_hash = crypt(v_code, gen_salt('bf')), pickup_failed_attempts = 0,
         pickup_locked_until = null, updated_at = now() where id = p_parcel;
  perform public.nzk_parcel_log(p_parcel, pc.status, pc.status, 'nouveau_code', p_agent, null, pc.trip_id, 'Nouveau code de retrait : ' || trim(p_note));
  return jsonb_build_object('ok', true, 'pickup_code', v_code, 'reference', pc.reference);
end $$;

-- Vérifie un code de retrait sans rien modifier (impression du reçu juste après le dépôt)
create or replace function public.nzk_parcel_code_matches(p_parcel uuid, p_code text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.parcels where id = p_parcel and p_code ~ '^\d{6}$' and crypt(p_code, pickup_code_hash) = pickup_code_hash);
$$;

-- ------------------------------------------------------------
-- 7. Lecture agent : scan, liste, détail, départs, manifeste
-- ------------------------------------------------------------
create or replace function public.nzk_parcel_scan(p_agent uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_code text; pc record;
begin
  if not exists (select 1 from public.nzk_agent(p_agent)) then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  v_code := regexp_replace(upper(regexp_replace(coalesce(p_code, ''), '^.*:', '')), '[^0-9A-Z-]', '', 'g');
  select id, reference into pc from public.parcels where qr_code = v_code or reference = v_code;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  return jsonb_build_object('ok', true, 'id', pc.id, 'reference', pc.reference);
end $$;

create or replace function public.nzk_parcel_row(pc public.parcels)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', pc.id, 'reference', pc.reference, 'status', pc.status, 'created_at', pc.created_at, 'updated_at', pc.updated_at,
    'sender_name', pc.sender_name, 'sender_phone', pc.sender_phone, 'recipient_name', pc.recipient_name, 'recipient_phone', pc.recipient_phone,
    'from_city', pc.from_city, 'from_terminal', pc.from_terminal, 'to_city', pc.to_city, 'to_terminal', pc.to_terminal,
    'from_city_name', (select name from public.cities where id = pc.from_city),
    'to_city_name', (select name from public.cities where id = pc.to_city),
    'from_terminal_name', (select name from public.terminals where id = pc.from_terminal),
    'to_terminal_name', (select name from public.terminals where id = pc.to_terminal),
    'category_id', pc.category_id, 'category_label', (select label from public.parcel_categories where id = pc.category_id),
    'description', pc.description, 'quantity', pc.quantity, 'weight_kg', pc.weight_kg, 'declared_value', pc.declared_value,
    'notes', pc.notes, 'price', pc.price, 'payer', pc.payer, 'payment_status', pc.payment_status, 'trip_id', pc.trip_id,
    'trip', (select jsonb_build_object('date', tr.date, 'departure_time', tr.departure_time, 'direction', tr.direction,
                                       'bus_name', b.name, 'corridor_label', c.label)
             from public.trips tr join public.services sv on sv.id = tr.service_id
             join public.corridors c on c.id = sv.corridor_id left join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
             where tr.id = pc.trip_id),
    'pickup_locked_until', pc.pickup_locked_until, 'pickup_failed_attempts', pc.pickup_failed_attempts,
    'picked_up_at', pc.picked_up_at, 'qr_code', pc.qr_code
  );
$$;

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
      where (a.role = 'admin' or a.terminal_id is null or pc.from_terminal = a.terminal_id or pc.to_terminal = a.terminal_id)
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

create or replace function public.nzk_parcel_detail(p_agent uuid, p_parcel uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; pc public.parcels;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  select * into pc from public.parcels where id = p_parcel;
  if not found then return null; end if;
  if not (public.nzk_agent_covers(p_agent, pc.from_terminal) or public.nzk_agent_covers(p_agent, pc.to_terminal)) then return null; end if;
  return public.nzk_parcel_row(pc) || jsonb_build_object(
    'can_origin', public.nzk_agent_covers(p_agent, pc.from_terminal),
    'can_destination', public.nzk_agent_covers(p_agent, pc.to_terminal),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                 'at', e.created_at, 'from_status', e.from_status, 'to_status', e.to_status, 'action', e.action, 'note', e.note,
                 'agent', (select full_name from public.agent_profiles where id = e.agent_id),
                 'terminal', (select name from public.terminals where id = e.terminal_id)) order by e.id)
               from public.parcel_events e where e.parcel_id = pc.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'method', p.method, 'moment', p.moment,
                 'transaction_code', p.transaction_code, 'at', p.collected_at,
                 'agent', (select full_name from public.agent_profiles where id = p.collected_by)) order by p.collected_at)
               from public.parcel_payments p where p.parcel_id = pc.id), '[]'::jsonb)
  );
end $$;

-- Départs d'une ville pour une date (crée les départs du jour), avec passagers et colis
create or replace function public.nzk_city_departures(p_city text, p_date date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e record;
begin
  -- Génère les départs du jour pour chaque extrémité de corridor desservie depuis cette ville
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
        'corridor_label', c.label, 'bus_name', b.name,
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
      where tr.date = p_date and tr.status = 'scheduled' and tr.departure_time = any (sv.departure_times)
        and not (tr.direction = 'aller' and me.stop_order = mx.max_o)
        and not (tr.direction = 'retour' and me.stop_order = mx.min_o)
    ) s), '[]'::jsonb);
end $$;

create or replace function public.nzk_trip_manifest(p_agent uuid, p_trip uuid, p_city text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public.nzk_agent(p_agent);
  if not found then return null; end if;
  return jsonb_build_object(
    'trip', (select jsonb_build_object('trip_id', tr.id, 'date', tr.date, 'departure_time', tr.departure_time,
                                       'direction', tr.direction, 'corridor_label', c.label, 'bus_name', b.name)
             from public.trips tr join public.services sv on sv.id = tr.service_id
             join public.corridors c on c.id = sv.corridor_id left join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
             where tr.id = p_trip),
    'passengers', (select count(*) from public.passengers ps join public.bookings bk on bk.id = ps.booking_id
                   where bk.trip_id = p_trip and bk.status in ('pending', 'confirmed') and (p_city is null or bk.from_city = p_city)),
    'parcels', coalesce((select jsonb_agg(public.nzk_parcel_row(pc) order by pc.to_city, pc.reference)
                         from public.parcels pc
                         where pc.trip_id = p_trip and pc.status in ('affecte', 'charge', 'en_transit')
                           and (p_city is null or pc.from_city = p_city)), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------
-- 8. Suivi public : référence + 4 derniers chiffres d'un téléphone
-- ------------------------------------------------------------
create or replace function public.nzk_parcel_track(p_reference text, p_phone4 text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record; v_from text; v_to text; v_public text;
begin
  select * into pc from public.parcels where reference = upper(trim(coalesce(p_reference, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if pc.track_locked_until is not null and pc.track_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_TENTATIVES');
  end if;
  if coalesce(p_phone4, '') !~ '^\d{4}$'
     or (right(public.nzk_digits(pc.sender_phone), 4) <> p_phone4 and right(public.nzk_digits(pc.recipient_phone), 4) <> p_phone4) then
    update public.parcels set track_failed_attempts = track_failed_attempts + 1,
           track_locked_until = case when track_failed_attempts + 1 >= 10 then now() + interval '1 hour' else null end
    where id = pc.id;
    return jsonb_build_object('ok', false, 'error', 'INTROUVABLE');
  end if;
  update public.parcels set track_failed_attempts = 0, track_locked_until = null where id = pc.id and track_failed_attempts > 0;

  v_from := (select name from public.cities where id = pc.from_city);
  v_to := (select name from public.cities where id = pc.to_city);
  v_public := case pc.status
    when 'depose' then 'depose' when 'affecte' then 'depose' when 'charge' then 'depose'
    when 'en_transit' then 'en_transit' when 'arrive' then 'arrive' when 'pret_au_retrait' then 'pret_au_retrait'
    when 'retire' then 'retire' when 'annule' then 'annule' else 'verification' end;

  return jsonb_build_object(
    'ok', true, 'reference', pc.reference, 'status', v_public, 'from_city', v_from, 'to_city', v_to,
    'to_terminal', (select name from public.terminals where id = pc.to_terminal),
    'payment_due', pc.payment_status = 'a_payer' and pc.status not in ('retire', 'annule'),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.st, 'at', s.at) order by s.at)
      from (
        select distinct on (st) st, at from (
          select case e.to_status
                   when 'depose' then 'depose' when 'en_transit' then 'en_transit' when 'arrive' then 'arrive'
                   when 'pret_au_retrait' then 'pret_au_retrait' when 'retire' then 'retire' when 'annule' then 'annule'
                 end as st, e.created_at as at
          from public.parcel_events e where e.parcel_id = pc.id
        ) x where st is not null order by st, at
      ) s), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------
-- 9. Revenus (voyageurs / colis / total)
-- ------------------------------------------------------------
create or replace function public.nzk_revenue_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'voyageurs', coalesce((select sum(amount) from public.payments
                           where status = 'confirmed' and (confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
    'voyageurs_count', (select count(*) from public.payments
                        where status = 'confirmed' and (confirmed_at at time zone 'Africa/Brazzaville')::date between p_from and p_to),
    'colis', coalesce((select sum(amount) from public.parcel_payments
                       where status = 'confirmed' and (collected_at at time zone 'Africa/Brazzaville')::date between p_from and p_to), 0),
    'colis_count', (select count(*) from public.parcel_payments
                    where status = 'confirmed' and (collected_at at time zone 'Africa/Brazzaville')::date between p_from and p_to)
  );
$$;

-- Tarifs : lecture (agents) et modification (admin)
create or replace function public.nzk_parcel_categories()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb) from public.parcel_categories c;
$$;

create or replace function public.nzk_parcel_category_update(p_agent uuid, p_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.nzk_agent(p_agent) where role = 'admin') then return jsonb_build_object('ok', false, 'error', 'NON_AUTORISE'); end if;
  update public.parcel_categories set
    fare_percent = coalesce((p->>'fare_percent')::int, fare_percent),
    min_price = coalesce((p->>'min_price')::int, min_price),
    price_per_kg = coalesce((p->>'price_per_kg')::int, price_per_kg),
    is_active = coalesce((p->>'is_active')::boolean, is_active),
    updated_at = now()
  where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 10. Droits : fonctions réservées au serveur
-- ------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('nzk_digits', 'nzk_agent', 'nzk_agent_covers', 'nzk_parcel_price', 'nzk_parcel_quote', 'nzk_parcel_log',
                        'nzk_new_pickup_code', 'nzk_parcel_create', 'nzk_parcel_trip_options', 'nzk_trip_serves',
                        'nzk_parcel_transition', 'nzk_parcel_receive', 'nzk_trip_depart_parcels', 'nzk_parcel_pickup',
                        'nzk_parcel_reset_code', 'nzk_parcel_code_matches', 'nzk_parcel_scan', 'nzk_parcel_row',
                        'nzk_parcel_list', 'nzk_parcel_detail', 'nzk_city_departures', 'nzk_trip_manifest',
                        'nzk_parcel_track', 'nzk_revenue_summary', 'nzk_parcel_categories', 'nzk_parcel_category_update')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;
