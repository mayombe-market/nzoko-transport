-- TEST APRÈS DÉPLOIEMENT — multi-agences (fonctions en production, tout est annulé à la fin)
do $test$
declare
  f record; r text := ''; a uuid; j jsonb; jb jsonb; jc jsonb; v_trip uuid; v_trip_r uuid; b1 uuid; b2 uuid; n int; avant text;
begin
  a := (select id from public.agent_profiles where role = 'admin' limit 1);
  avant := (select count(*) from public.bookings)::text || '/' || (select count(*) from public.payments)::text || '/' || (select count(*) from public.parcels)::text;

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
  raise exception E'TEST APRÈS DÉPLOIEMENT — multi-agences (tout a été annulé)\n%', r;
end
$test$;
