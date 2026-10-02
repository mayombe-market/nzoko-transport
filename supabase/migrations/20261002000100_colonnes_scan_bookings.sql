-- ============================================================
-- Nzoko Transport — Colonnes manquantes pour le scanner (2 octobre 2026)
-- La base réelle n'a pas les colonnes prévues par supabase/schema.sql
-- et utilisées par /api/validate-ticket. Ajout uniquement (aucune
-- donnée modifiée ni supprimée).
-- Retour arrière : alter table public.bookings drop column scan_count, drop column last_scanned_at;
-- ============================================================

alter table public.bookings
  add column if not exists scan_count integer not null default 0,
  add column if not exists last_scanned_at timestamptz;
