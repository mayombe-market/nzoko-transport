-- TEST À BLANC — agence bénéficiaire explicite (tout est annulé à la fin)
do $test$
declare r text := ''; a uuid; j jsonb; v_trip uuid; v_pc uuid; c text; n int;
begin
  a := (select id from public.agent_profiles where role = 'admin' limit 1);
  -- ==================== MIGRATION ====================


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

  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('nzk_city_agency_count', 'nzk_pick_agency', 'nzk_trip_payment_info', 'nzk_create_booking', 'nzk_lock_agencies')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;



  -- ==================== TESTS ====================
  -- Comptes de test : Mpila (MTN + Airtel), Centre-ville (MTN), Château d'eau : AUCUN
  perform public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"mtn","number":"060000001","holder_name":"TEST Mpila"}');
  perform public.nzk_payment_account_save(a, '{"terminal_id":"mpila","provider":"airtel","number":"050000002","holder_name":"TEST Mpila"}');
  perform public.nzk_payment_account_save(a, '{"terminal_id":"centre-ville","provider":"mtn","number":"060000003","holder_name":"TEST PNR"}');
  v_trip := (select trip_id from public.nzk_get_departures('brazzaville', 'pointenoire', (public.nzk_now())::date + 2) limit 1);

  j := public.nzk_trip_payment_info(v_trip, 'brazzaville', 'pointenoire', null);
  r := r || case when j->>'status' = 'agence_a_choisir' and jsonb_array_length(j->'accounts') = 0 then '✅ ' else '❌ ' end || 'Brazzaville sans agence choisie : ' || (j->>'status') || ' (' || jsonb_array_length(j->'agencies') || ' agences proposées, aucun numéro)' || chr(10);
  j := public.nzk_trip_payment_info(v_trip, 'brazzaville', 'pointenoire', 'mpila');
  r := r || case when j->>'status' = 'ok' and j->>'agency_name' = 'Mpila' and jsonb_array_length(j->'accounts') = 2 then '✅ ' else '❌ ' end || 'agence Mpila choisie : ' || (j->>'agency_name') || ', ' || jsonb_array_length(j->'accounts') || ' comptes de Mpila' || chr(10);
  j := public.nzk_trip_payment_info(v_trip, 'brazzaville', 'pointenoire', 'chateau-deau');
  r := r || case when j->>'status' = 'indisponible' and j->>'agency_name' = 'Château d''eau' and jsonb_array_length(j->'accounts') = 0 then '✅ ' else '❌ ' end || 'agence Château d''eau (sans compte) : ' || (j->>'status') || ' — aucun numéro d''une autre agence' || chr(10);
  j := public.nzk_trip_payment_info(v_trip, 'kinkala', 'pointenoire', null);
  r := r || case when j->>'status' = 'aucune_agence' then '✅ ' else '❌ ' end || 'Kinkala (ville sans agence) : ' || (j->>'status') || ' — plus de repli vers Château d''eau' || chr(10);

  perform public.nzk_hold_seat(v_trip, 'A10', 'tok-expl-aaaaaaaaaaaaaaaaaa');
  j := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', null, 'centre-ville', 'tok-expl-aaaaaaaaaaaaaaaaaa',
        '[{"full_name":"TEST Explicite","phone":"060008888","seat":"A10"}]'::jsonb, '060008888', null, 'mtn', 'TEST-EXPL-A10', '060008888');
  r := r || case when j->>'error' = 'AGENCE_DEPART_A_CHOISIR' then '✅ ' else '❌ ' end || 'réservation sans agence de départ : ' || coalesce(j->>'error','ACCEPTÉE') || chr(10);

  perform public.nzk_hold_seat(v_trip, 'A11', 'tok-expl-bbbbbbbbbbbbbbbbbb');
  j := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', null, 'tok-expl-bbbbbbbbbbbbbbbbbb',
        '[{"full_name":"TEST Explicite","phone":"060008888","seat":"A11"}]'::jsonb, '060008888', null, 'mtn', 'TEST-EXPL-A11', '060008888');
  r := r || case when j->>'error' = 'AGENCE_ARRIVEE_A_CHOISIR' then '✅ ' else '❌ ' end || 'réservation sans agence d''arrivée : ' || coalesce(j->>'error','ACCEPTÉE') || chr(10);

  perform public.nzk_hold_seat(v_trip, 'A12', 'tok-expl-cccccccccccccccccc');
  j := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'chateau-deau', 'centre-ville', 'tok-expl-cccccccccccccccccc',
        '[{"full_name":"TEST Explicite","phone":"060008888","seat":"A12"}]'::jsonb, '060008888', null, 'mtn', 'TEST-EXPL-A12', '060008888');
  r := r || case when j->>'error' = 'AUCUN_COMPTE' then '✅ ' else '❌ ' end || 'départ Château d''eau sans compte : ' || coalesce(j->>'error','ACCEPTÉE') || ' (pas de compte de Mpila utilisé)' || chr(10);

  perform public.nzk_hold_seat(v_trip, 'A13', 'tok-expl-dddddddddddddddddd');
  j := public.nzk_create_booking(v_trip, 'kinkala', 'pointenoire', null, 'centre-ville', 'tok-expl-dddddddddddddddddd',
        '[{"full_name":"TEST Explicite","phone":"060008888","seat":"A13"}]'::jsonb, '060008888', null, 'mtn', 'TEST-EXPL-A13', '060008888');
  r := r || case when j->>'error' = 'AGENCE_INTROUVABLE' then '✅ ' else '❌ ' end || 'départ de Kinkala : ' || coalesce(j->>'error','ACCEPTÉE') || chr(10);

  perform public.nzk_hold_seat(v_trip, 'A14', 'tok-expl-eeeeeeeeeeeeeeeeee');
  j := public.nzk_create_booking(v_trip, 'brazzaville', 'pointenoire', 'mpila', 'centre-ville', 'tok-expl-eeeeeeeeeeeeeeeeee',
        '[{"full_name":"TEST Explicite","phone":"060008888","seat":"A14"}]'::jsonb, '060008888', null, 'mtn', 'TEST-EXPL-A14', '060008888');
  r := r || case when (j->>'ok')::boolean and j->>'agency_name' = 'Mpila' then '✅ ' else '❌ ' end || 'réservation Mpila → Centre-ville : ' || coalesce(j->>'agency_name', j->>'error') || chr(10);
  select count(*) into n from public.bookings b join public.payments p on p.booking_id = b.id
  where b.id = (j->>'booking_id')::uuid and b.from_terminal = 'mpila' and b.to_terminal = 'centre-ville' and p.agency_id = 'mpila'
    and p.account_id in (select id from public.agency_payment_accounts where terminal_id = 'mpila');
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'paiement rattaché à Mpila et à un compte de Mpila' || chr(10);

  begin update public.bookings set from_terminal = 'chateau-deau' where id = (j->>'booking_id')::uuid;
    r := r || '❌ changer l''agence de départ après création : ACCEPTÉ' || chr(10);
  exception when others then r := r || '✅ changer l''agence de départ après création : refusé' || chr(10); end;
  begin update public.payments set agency_id = 'centre-ville' where booking_id = (j->>'booking_id')::uuid;
    r := r || '❌ changer l''agence bénéficiaire du paiement : ACCEPTÉ' || chr(10);
  exception when others then r := r || '✅ changer l''agence bénéficiaire du paiement : refusé' || chr(10); end;

  update public.agent_profiles set role = 'agent', terminal_id = 'chateau-deau' where id = a;
  r := r || case when (public.nzk_confirm_payment((j->>'booking_id')::uuid, a))->>'error' = 'NON_AUTORISE' then '✅' else '❌' end || ' agent de Château d''eau (même ville) confirme un paiement de Mpila : refusé' || chr(10);
  update public.agent_profiles set role = 'manager', terminal_id = 'mpila' where id = a;
  r := r || case when ((public.nzk_confirm_payment((j->>'booking_id')::uuid, a))->>'ok')::boolean then '✅' else '❌' end || ' responsable de Mpila confirme : accepté' || chr(10);
  update public.agent_profiles set role = 'admin', terminal_id = null where id = a;

  -- Colis : dépôt = agence de départ, port dû = agence d'arrivée
  j := public.nzk_parcel_create(a, jsonb_build_object('sender_name','TEST','sender_phone','060008888','recipient_name','TEST','recipient_phone','050008888',
        'from_terminal','mpila','to_terminal','centre-ville','category_id','petit','description','TEST','payer','expediteur','method','especes'));
  select count(*) into n from public.parcel_payments where parcel_id = (j->>'id')::uuid and terminal_id = 'mpila' and moment = 'depot';
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'colis payé au dépôt → encaissé par Mpila (départ)' || chr(10);
  j := public.nzk_parcel_create(a, jsonb_build_object('sender_name','TEST','sender_phone','060008888','recipient_name','TEST','recipient_phone','050008888',
        'from_terminal','mpila','to_terminal','centre-ville','category_id','petit','description','TEST','payer','destinataire'));
  v_pc := (j->>'id')::uuid; c := j->>'pickup_code';
  perform public.nzk_parcel_transition(a, v_pc, 'assign', (select (public.nzk_parcel_trip_options(v_pc, (public.nzk_now())::date + 2))->0->>'trip_id')::uuid, null);
  perform public.nzk_parcel_transition(a, v_pc, 'load', null, null);
  perform public.nzk_parcel_transition(a, v_pc, 'depart', null, null);
  perform public.nzk_parcel_receive(a, v_pc);
  perform public.nzk_parcel_pickup(a, v_pc, c, 'especes', null);
  select count(*) into n from public.parcel_payments where parcel_id = v_pc and terminal_id = 'centre-ville' and moment = 'retrait';
  r := r || case when n = 1 then '✅ ' else '❌ ' end || 'colis en port dû → encaissé par Centre-ville (arrivée)' || chr(10);

  raise exception E'RÉSULTATS DU TEST À BLANC — agence explicite (tout a été annulé)\n%', r;
end
$test$;
