# Sauvegarde de la base avant la migration de sécurité — 2 octobre 2026

Relevé fait en lecture seule sur le projet `rjpghxgejptwqbdijwom` (nzoko-transport) avant toute modification.
Aucune donnée personnelle ici.

## État constaté

- **RLS désactivée sur les 12 tables publiques** : `agent_profiles`, `bookings`, `buses`, `cities`, `company`,
  `corridor_stops`, `corridors`, `passengers`, `payments`, `services`, `terminals`, `trips`.
  Les politiques ci-dessous existaient mais ne s'appliquaient pas.
- Rôles `anon` et `authenticated` : `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` sur les 12 tables.
- Aucun trigger, aucune vue, aucun bucket Storage. Une fonction : `rls_auto_enable()` (Supabase).
- Extensions : pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.
- Comptes Auth : 1 (l'admin), email confirmé, créé le 25/06/2026, dernière connexion le 08/07/2026.
- Volumes : company 1, cities 15, terminals 6, corridors 4, corridor_stops 20, buses 4, services 7, trips 0,
  bookings 7 (toutes `pending`), passengers 12, payments 7 (tous `pending`), agent_profiles 1 (admin actif).
- Écarts avec `supabase/schema.sql` : `bookings` n'a pas `user_id`, `scan_count`, `last_scanned_at` ;
  `terminals` n'a pas de politique de lecture ; le reste est conforme.

## Politiques existantes (avant migration)

| Table | Politique | Commande | Rôles | Condition |
|---|---|---|---|---|
| agent_profiles | Admin full access | ALL | authenticated | `EXISTS (SELECT 1 FROM agent_profiles a WHERE a.id = auth.uid() AND a.role = 'admin')` |
| agent_profiles | Read own profile | SELECT | authenticated | `id = auth.uid()` |
| agent_profiles | Service role bypass | ALL | service_role | `true` |
| bookings | Agents read all bookings | SELECT | public | `EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())` |
| bookings | Anyone can create booking | INSERT | public | check `true` |
| bookings | Customer reads own booking | SELECT | public | `reference = current_setting('app.current_booking_ref', true)` |
| buses | Public read buses | SELECT | public | `is_active = true` |
| cities | Public read cities | SELECT | public | `is_active = true` |
| company | Public read company | SELECT | public | `true` |
| corridor_stops | Public read corridor_stops | SELECT | public | `true` |
| corridors | Public read corridors | SELECT | public | `is_active = true` |
| passengers | Agents read passengers | SELECT | public | `EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())` |
| passengers | Anyone can add passenger | INSERT | public | check `true` |
| payments | Agents manage payments | ALL | public | `EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())` |
| payments | Anyone can create payment | INSERT | public | check `true` |
| services | Public read services | SELECT | public | `is_active = true` |

## Retour arrière (à n'utiliser qu'en cas de blocage — rouvre les failles)

```sql
-- 1. Supprimer les politiques de la migration
do $$ declare pol record; begin
  for pol in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop; end $$;

-- 2. Recréer les politiques d'origine
create policy "Admin full access" on public.agent_profiles for all to authenticated
  using (exists (select 1 from public.agent_profiles a where a.id = auth.uid() and a.role = 'admin'));
create policy "Read own profile" on public.agent_profiles for select to authenticated using (id = auth.uid());
create policy "Service role bypass" on public.agent_profiles for all to service_role using (true) with check (true);
create policy "Agents read all bookings" on public.bookings for select
  using (exists (select 1 from public.agent_profiles where id = auth.uid()));
create policy "Anyone can create booking" on public.bookings for insert with check (true);
create policy "Customer reads own booking" on public.bookings for select
  using (reference = current_setting('app.current_booking_ref', true));
create policy "Public read buses" on public.buses for select using (is_active = true);
create policy "Public read cities" on public.cities for select using (is_active = true);
create policy "Public read company" on public.company for select using (true);
create policy "Public read corridor_stops" on public.corridor_stops for select using (true);
create policy "Public read corridors" on public.corridors for select using (is_active = true);
create policy "Agents read passengers" on public.passengers for select
  using (exists (select 1 from public.agent_profiles where id = auth.uid()));
create policy "Anyone can add passenger" on public.passengers for insert with check (true);
create policy "Agents manage payments" on public.payments for all
  using (exists (select 1 from public.agent_profiles where id = auth.uid()));
create policy "Anyone can create payment" on public.payments for insert with check (true);
create policy "Public read services" on public.services for select using (is_active = true);

-- 3. Droits d'origine
grant all on public.agent_profiles, public.bookings, public.buses, public.cities, public.company,
  public.corridor_stops, public.corridors, public.passengers, public.payments, public.services,
  public.terminals, public.trips to anon, authenticated;

-- 4. (état d'origine : RLS désactivée — à ne PAS refaire sauf urgence absolue)
-- alter table public.<table> disable row level security;
```
