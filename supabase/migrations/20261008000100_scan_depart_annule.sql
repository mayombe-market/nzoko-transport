-- ============================================================
-- Journal des scans : nouveau résultat « trip_cancelled » (départ annulé)
-- Élargit la contrainte existante, aucune donnée modifiée.
-- ============================================================
begin;
alter table public.ticket_scans drop constraint if exists ticket_scans_result_check;
alter table public.ticket_scans add constraint ticket_scans_result_check
  check (result in ('valid', 'invalid', 'cancelled', 'not_confirmed', 'already_used', 'wrong_date', 'trip_cancelled'));
commit;
