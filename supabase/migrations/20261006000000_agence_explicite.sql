-- ============================================================
-- Nzoko Transport — Agence bénéficiaire toujours choisie explicitement (6 octobre 2026)
--
-- - Plus aucun repli financier vers une « agence principale » : dans une ville qui
--   compte plusieurs agences, le client doit choisir son agence de départ et d'arrivée.
--   Une ville avec une seule agence : celle-ci. Une ville de départ sans agence :
--   paiement en ligne indisponible.
-- - Le paiement voyageur va uniquement sur un compte actif de l'agence de départ ;
--   sans compte actif : refus explicite (AUCUN_COMPTE).
-- - Une fois fixées, l'agence de départ / d'arrivée d'une réservation et l'agence
--   bénéficiaire d'un paiement ne peuvent plus changer (trigger).
-- - terminals.is_main est conservé pour l'affichage uniquement.
-- Aucune donnée modifiée.
-- ============================================================

begin;

create or replace function public.nzk_city_agency_count(p_city text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.terminals where city_id = p_city and is_active;
$$;

-- Agence choisie si valide dans la ville ; sinon la seule agence de la ville ; sinon null (choix obligatoire)
create or replace function public.nzk_pick_agency(p_city text, p_chosen text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.terminals where id = p_chosen and city_id = p_city and is_active),
    (select min(id) from public.terminals where city_id = p_city and is_active having count(*) = 1)
  );
$$;

-- Informations de paiement présentées au client (aucun repli vers une autre agence)
create or replace function public.nzk_trip_payment_info(p_trip uuid, p_from text, p_to text, p_from_terminal text)
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
  select coalesce(jsonb_agg(jsonb_build_object('provider', a.provider, 'number', a.number, 'holder_name', a.holder_name) order by a.provider), '[]'::jsonb)
  into v_accounts
  from (select distinct on (provider) * from public.agency_payment_accounts
        where terminal_id = v_agency and is_active order by provider, updated_at desc) a;
  return jsonb_build_object(
    'status', case when jsonb_array_length(v_accounts) = 0 then 'indisponible' else 'ok' end,
    'agency_id', v_agency,
    'agency_name', (select name from public.terminals where id = v_agency),
    'agency_city', (select c.name from public.terminals t join public.cities c on c.id = t.city_id where t.id = v_agency),
    'accounts', v_accounts);
end $$;

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
  -- Agences choisies explicitement par le client (aucun repli vers une « agence principale »)
  if public.nzk_city_agency_count(p_from) = 0 then return jsonb_build_object('ok', false, 'error', 'AGENCE_INTROUVABLE'); end if;
  p_from_terminal := public.nzk_pick_agency(p_from, p_from_terminal);
  if p_from_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_DEPART_A_CHOISIR'); end if;
  if public.nzk_city_agency_count(p_to) > 0 then
    p_to_terminal := public.nzk_pick_agency(p_to, p_to_terminal);
    if p_to_terminal is null then return jsonb_build_object('ok', false, 'error', 'AGENCE_ARRIVEE_A_CHOISIR'); end if;
  else
    p_to_terminal := null;  -- ville d'arrivée sans agence Nzoko
  end if;
  select name into v_agency_name from public.terminals where id = p_from_terminal;

  -- Paiement uniquement sur un compte actif de l'agence de départ (jamais celui d'une autre agence)
  if not exists (select 1 from public.agency_payment_accounts where terminal_id = p_from_terminal and is_active) then
    return jsonb_build_object('ok', false, 'error', 'AUCUN_COMPTE', 'agency_name', v_agency_name);
  end if;
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

-- L'agence d'une réservation / d'un paiement ne change plus une fois fixée
create or replace function public.nzk_lock_agencies()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'bookings' then
    if (old.from_terminal is not null and new.from_terminal is distinct from old.from_terminal)
       or (old.to_terminal is not null and new.to_terminal is distinct from old.to_terminal) then
      raise exception 'AGENCE_FIGEE: l''agence de départ / d''arrivée d''une réservation ne peut pas être modifiée';
    end if;
  elsif tg_table_name = 'payments' then
    if old.agency_id is not null and new.agency_id is distinct from old.agency_id then
      raise exception 'AGENCE_FIGEE: l''agence bénéficiaire d''un paiement ne peut pas être modifiée';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_lock_agencies on public.bookings;
create trigger bookings_lock_agencies before update of from_terminal, to_terminal on public.bookings
  for each row execute function public.nzk_lock_agencies();
drop trigger if exists payments_lock_agency on public.payments;
create trigger payments_lock_agency before update of agency_id on public.payments
  for each row execute function public.nzk_lock_agencies();

-- L'ancien sélecteur avec repli vers l'agence principale n'est plus utilisé
drop function if exists public.nzk_resolve_agency(text, text, text);

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('nzk_city_agency_count', 'nzk_pick_agency', 'nzk_trip_payment_info', 'nzk_create_booking', 'nzk_lock_agencies')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;
