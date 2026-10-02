-- ============================================================
-- Nzoko Transport — Migration de sécurité (2 octobre 2026)
-- Empêche toute lecture anonyme de bookings, passengers, payments
-- et agent_profiles, sans casser le parcours public de réservation.
--
-- AUCUNE donnée n'est supprimée ni modifiée : seules les règles
-- d'accès (RLS) et les droits du rôle `anon` changent.
-- Retour arrière : recréer les politiques sauvegardées avant migration.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Fonctions d'aide (SECURITY DEFINER : lisent les tables sans
--    passer par la RLS, ce qui évite toute récursion de politique)
-- ------------------------------------------------------------

-- Agent ou admin connecté ET actif
create or replace function public.is_active_agent()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agent_profiles
    where id = auth.uid() and is_active = true and role in ('admin', 'agent')
  );
$$;

-- Admin connecté ET actif
create or replace function public.is_active_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agent_profiles
    where id = auth.uid() and is_active = true and role = 'admin'
  );
$$;

-- Email CONFIRMÉ du client connecté (null sinon)
create or replace function public.current_confirmed_email()
returns text
language sql stable security definer
set search_path = public, auth
as $$
  select lower(email) from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
$$;

-- La réservation appartient-elle au client connecté ?
create or replace function public.owns_booking(p_booking_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where id = p_booking_id
      and customer_email is not null
      and lower(customer_email) = public.current_confirmed_email()
  );
$$;

-- Réservation encore « ouverte » : en attente et créée il y a moins d'une heure.
-- Sert à n'autoriser l'ajout de passagers / paiement que juste après la création,
-- et jamais sur la réservation d'un autre client plus ancienne.
create or replace function public.booking_is_open(p_booking_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where id = p_booking_id
      and status = 'pending'
      and created_at > now() - interval '1 hour'
  );
$$;

-- ------------------------------------------------------------
-- 2. Retirer TOUTES les politiques existantes sur les 4 tables
--    (leurs définitions sont sauvegardées avant exécution)
-- ------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('bookings', 'passengers', 'payments', 'agent_profiles')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.bookings       enable row level security;
alter table public.passengers     enable row level security;
alter table public.payments       enable row level security;
alter table public.agent_profiles enable row level security;

-- ------------------------------------------------------------
-- 3. Droits du rôle anon : écriture limitée, AUCUNE lecture
--    (défense en profondeur : même une politique erronée ne pourrait plus exposer ces tables)
-- ------------------------------------------------------------
revoke select, update, delete, truncate, references, trigger on public.bookings   from anon;
revoke select, update, delete, truncate, references, trigger on public.passengers from anon;
revoke select, update, delete, truncate, references, trigger on public.payments   from anon;
revoke all on public.agent_profiles from anon;
grant insert on public.bookings, public.passengers, public.payments to anon;

-- ------------------------------------------------------------
-- 4. bookings
-- ------------------------------------------------------------
-- Parcours public : créer une réservation EN ATTENTE uniquement
create policy "public_cree_reservation_en_attente" on public.bookings
  for insert to anon, authenticated
  with check (status = 'pending' and total_price > 0 and passenger_count between 1 and 20);

-- Client connecté (email confirmé) : lit ses propres réservations
create policy "client_lit_ses_reservations" on public.bookings
  for select to authenticated
  using (customer_email is not null and lower(customer_email) = public.current_confirmed_email());

-- Agents actifs : lisent et mettent à jour (confirmer / annuler)
create policy "agents_lisent_reservations" on public.bookings
  for select to authenticated
  using (public.is_active_agent());

create policy "agents_modifient_reservations" on public.bookings
  for update to authenticated
  using (public.is_active_agent())
  with check (public.is_active_agent());

-- ------------------------------------------------------------
-- 5. passengers
-- ------------------------------------------------------------
create policy "public_ajoute_passagers_reservation_ouverte" on public.passengers
  for insert to anon, authenticated
  with check (public.booking_is_open(booking_id));

create policy "client_lit_ses_passagers" on public.passengers
  for select to authenticated
  using (public.owns_booking(booking_id));

create policy "agents_lisent_passagers" on public.passengers
  for select to authenticated
  using (public.is_active_agent());

-- ------------------------------------------------------------
-- 6. payments
-- ------------------------------------------------------------
-- Parcours public : déclarer un paiement EN ATTENTE, jamais « confirmé »
create policy "public_declare_paiement_en_attente" on public.payments
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and confirmed_by is null
    and confirmed_at is null
    and public.booking_is_open(booking_id)
  );

create policy "agents_lisent_paiements" on public.payments
  for select to authenticated
  using (public.is_active_agent());

create policy "agents_modifient_paiements" on public.payments
  for update to authenticated
  using (public.is_active_agent())
  with check (public.is_active_agent());

-- ------------------------------------------------------------
-- 7. agent_profiles
-- ------------------------------------------------------------
create policy "agent_lit_son_profil" on public.agent_profiles
  for select to authenticated
  using (id = auth.uid());

create policy "admin_lit_profils" on public.agent_profiles
  for select to authenticated
  using (public.is_active_admin());

create policy "admin_modifie_profils" on public.agent_profiles
  for update to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- La création de comptes passe uniquement par /api/create-agent (clé serveur).
-- Aucune politique INSERT / DELETE pour les navigateurs.

commit;
