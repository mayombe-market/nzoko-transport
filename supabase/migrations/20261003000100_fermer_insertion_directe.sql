-- ============================================================
-- Nzoko Transport — Fermeture de l'insertion directe (3 octobre 2026)
-- Le site crée désormais les réservations uniquement via nzk_create_booking
-- (prix officiel calculé en base, sièges bloqués vérifiés). L'insertion
-- directe par l'API publique permettait de contourner ces contrôles
-- (prix imposé, siège non bloqué) : elle est retirée.
-- Aucune donnée modifiée.
-- Retour arrière : grant insert on public.bookings, public.passengers, public.payments to anon, authenticated;
--                  + recréer les 3 politiques « public_* » de 20261002000000.
-- ============================================================
begin;

revoke insert on public.bookings, public.passengers, public.payments from anon, authenticated;

drop policy if exists "public_cree_reservation_en_attente" on public.bookings;
drop policy if exists "public_ajoute_passagers_reservation_ouverte" on public.passengers;
drop policy if exists "public_declare_paiement_en_attente" on public.payments;

commit;
