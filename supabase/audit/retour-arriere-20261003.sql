-- ============================================================
-- Retour arrière des migrations du 3 octobre 2026 (réservation réelle)
-- À N'UTILISER QU'EN CAS DE BLOCAGE. Supprime les billets/scans/sièges
-- créés depuis (tables ajoutées par la migration) ; ne touche pas aux
-- réservations, passagers et paiements.
-- Le code du site déployé à partir du 3/10 dépend de ces fonctions :
-- revenir aussi au commit précédent (d236dc0) sur Vercel.
-- ============================================================
begin;

-- 20261003000100 : réouvrir l'insertion directe (ancienne méthode du site)
grant insert on public.bookings, public.passengers, public.payments to anon, authenticated;
create policy "public_cree_reservation_en_attente" on public.bookings
  for insert to anon, authenticated
  with check (status = 'pending' and total_price > 0 and passenger_count between 1 and 20);
create policy "public_ajoute_passagers_reservation_ouverte" on public.passengers
  for insert to anon, authenticated with check (public.booking_is_open(booking_id));
create policy "public_declare_paiement_en_attente" on public.payments
  for insert to anon, authenticated
  with check (status = 'pending' and confirmed_by is null and confirmed_at is null and public.booking_is_open(booking_id));

-- 20261003000000 : fonctions, tables et colonnes ajoutées
drop function if exists public.nzk_ticket_view(text, text);
drop function if exists public.nzk_scan_ticket(text, uuid);
drop function if exists public.nzk_cancel_booking(uuid, uuid, text);
drop function if exists public.nzk_reject_payment(uuid, uuid, text);
drop function if exists public.nzk_confirm_payment(uuid, uuid);
drop function if exists public.nzk_agent_can_handle(uuid, uuid);
drop function if exists public.nzk_create_booking(uuid, text, text, text, text, text, jsonb, text, text, text, text, text);
drop function if exists public.nzk_release_seat(uuid, text, text);
drop function if exists public.nzk_hold_seat(uuid, text, text);
drop function if exists public.nzk_trip_detail(uuid, text, text);
drop function if exists public.nzk_get_departures(text, text, date);
drop function if exists public.nzk_purge_holds(uuid);
drop function if exists public.nzk_segment_price(text, text, text);
drop function if exists public.nzk_seat_premium(int, int, int, text);
drop function if exists public.nzk_seat_valid(int, int, int, text);
drop function if exists public.nzk_now();
drop function if exists public.nzk_premium_supplement();

drop table if exists public.ticket_scans;
drop table if exists public.tickets;
drop table if exists public.trip_seats;

alter table public.bookings drop column if exists access_key, drop column if exists confirmed_at, drop column if exists cancelled_at;

-- trips : les départs générés depuis le 3/10 sont conservés ; on retire le sens et le bus
drop index if exists public.trips_service_date_heure_sens_key;
delete from public.trips t using public.trips t2
  where t.service_id = t2.service_id and t.date = t2.date and t.departure_time = t2.departure_time
    and t.direction = 'retour' and t2.direction = 'aller'
    and not exists (select 1 from public.bookings b where b.trip_id = t.id);
alter table public.trips drop constraint if exists trips_direction_check;
alter table public.trips drop column if exists direction, drop column if exists bus_id;
alter table public.trips add constraint trips_service_id_date_departure_time_key unique (service_id, date, departure_time);

commit;
