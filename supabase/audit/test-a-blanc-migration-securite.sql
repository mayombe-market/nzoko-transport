-- ============================================================
-- TEST À BLANC de la migration de sécurité — Nzoko Transport
--
-- Un seul bloc : applique la migration, exécute les tests, puis
-- DÉCLENCHE VOLONTAIREMENT UNE ERREUR qui affiche les résultats.
-- Cette erreur annule TOUT (migration + lignes de test) :
-- rien n'est conservé dans la base. Le message « ERROR » est normal.
-- ============================================================
do $test$
declare
  pol record;
  r text := '';
  v_id uuid := gen_random_uuid();
  v_old uuid;
  v_admin uuid;
  n int;
  avant text;
begin
  -- État initial (propriétaire)
  avant := (select count(*) from public.bookings)::text || ' / ' || (select count(*) from public.passengers)::text
        || ' / ' || (select count(*) from public.payments)::text || ' / ' || (select count(*) from public.agent_profiles)::text;
  v_old := (select id from public.bookings where created_at < now() - interval '1 hour' limit 1);
  v_admin := (select id from public.agent_profiles where role = 'admin' limit 1);

  -- ==================== MIGRATION ====================


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
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('bookings', 'passengers', 'payments', 'agent_profiles')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;

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


  -- ==================== TESTS ====================
  r := r || format('%-58s attendu %-16s obtenu %s', 'données avant : bookings / passengers / payments / agents', '7 / 12 / 7 / 1', avant) || chr(10);

  -- ---------- Visiteur anonyme ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  begin perform 1 from public.bookings limit 1; r := r || '❌ anonyme lit bookings : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme lit bookings : refusé' || chr(10); end;

  begin perform 1 from public.passengers limit 1; r := r || '❌ anonyme lit passengers : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme lit passengers : refusé' || chr(10); end;

  begin perform 1 from public.payments limit 1; r := r || '❌ anonyme lit payments : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme lit payments : refusé' || chr(10); end;

  begin perform 1 from public.agent_profiles limit 1; r := r || '❌ anonyme lit agent_profiles : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme lit agent_profiles : refusé' || chr(10); end;

  begin insert into public.agent_profiles(id, full_name, role) values (gen_random_uuid(), 'x', 'admin');
    r := r || '❌ anonyme crée un profil admin : AUTORISÉ' || chr(10);
  exception when insufficient_privilege or foreign_key_violation then r := r || '✅ anonyme crée un profil admin : refusé' || chr(10); end;

  begin update public.bookings set status = 'confirmed';
    r := r || '❌ anonyme modifie une réservation : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme modifie une réservation : refusé' || chr(10); end;

  begin insert into public.bookings(id, reference, date, departure_time, total_price, passenger_count, status)
        values (gen_random_uuid(), 'NZK-000000-FRAU', current_date, '06:00', 1000, 1, 'confirmed');
    r := r || '❌ anonyme crée une réservation déjà confirmée : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme crée une réservation déjà confirmée : refusé' || chr(10); end;

  begin insert into public.passengers(booking_id, full_name, seat_number) values (v_old, 'Intrus', 'Z9');
    r := r || '❌ anonyme ajoute un passager à la résa d''un autre : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme ajoute un passager à la résa d''un autre : refusé' || chr(10); end;

  begin insert into public.payments(booking_id, method, amount, transaction_code, phone_sender, status)
        values (v_old, 'mtn', 1000, 'X', 'X', 'confirmed');
    r := r || '❌ anonyme déclare un paiement confirmé : AUTORISÉ' || chr(10);
  exception when insufficient_privilege then r := r || '✅ anonyme déclare un paiement confirmé : refusé' || chr(10); end;

  -- Parcours public normal, exactement comme la page /paiement (insertion sans relecture)
  begin
    insert into public.bookings(id, reference, corridor_id, from_city, to_city, from_terminal, to_terminal,
                                date, departure_time, total_price, passenger_count, status, customer_phone, customer_email)
    values (v_id, 'NZK-000000-TEST', 'rn1', 'brazzaville', 'pointenoire', 'mpila', 'centre-ville',
            current_date + 7, '06:00', 26000, 2, 'pending', '060000000', null);
    insert into public.passengers(booking_id, full_name, phone, seat_number, is_primary)
    values (v_id, 'Test Un', '060000000', 'B4', true), (v_id, 'Test Deux', null, 'B5', false);
    insert into public.payments(booking_id, method, amount, transaction_code, phone_sender, status)
    values (v_id, 'mtn', 26000, 'TEST0000', '060000000', 'pending');
    r := r || '✅ parcours public (réservation + 2 passagers + paiement) : fonctionne' || chr(10);
  exception when others then
    r := r || '❌ parcours public : ERREUR ' || sqlerrm || chr(10);
  end;

  execute 'reset role';

  -- ---------- Admin existant (session simulée, sans mot de passe) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.agent_profiles where id = v_admin;
  r := r || case when n = 1 then '✅' else '❌' end || ' admin lit son profil (connexion admin) : ' || n || chr(10);
  select count(*) into n from public.bookings;
  r := r || case when n = 8 then '✅' else '❌' end || ' admin voit les réservations (7 + 1 test) : ' || n || chr(10);
  select count(*) into n from public.payments;
  r := r || case when n = 8 then '✅' else '❌' end || ' admin voit les paiements (7 + 1 test) : ' || n || chr(10);
  r := r || case when public.is_active_admin() then '✅' else '❌' end || ' admin reconnu actif' || chr(10);
  execute 'reset role';

  -- ---------- Client connecté quelconque (non agent) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.bookings;
  r := r || case when n = 0 then '✅' else '❌' end || ' client inconnu voit des réservations : ' || n || chr(10);
  select count(*) into n from public.agent_profiles;
  r := r || case when n = 0 then '✅' else '❌' end || ' client inconnu voit des profils agents : ' || n || chr(10);
  execute 'reset role';

  -- ---------- Données intactes ----------
  select count(*) into n from public.bookings where reference <> 'NZK-000000-TEST';
  r := r || case when n = 7 then '✅' else '❌' end || ' aucune réservation existante supprimée : ' || n || ' / 7' || chr(10);

  raise exception E'RÉSULTATS DU TEST À BLANC (tout a été annulé, rien n''est conservé)\n%', r;
end
$test$;
