-- ============================================================
-- Nzoko Transport — Audit de la base (LECTURE SEULE)
-- Une seule instruction SELECT sur les catalogues : ne modifie rien.
-- Aucune donnée personnelle (pas d'emails, noms ni téléphones).
-- Résultat : une ligne par rubrique, contenu en JSON.
-- ============================================================
select '01 tables + RLS' as rubrique, (
  select jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity, 'forcee', c.relforcerowsecurity) order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r') as contenu
union all
select '02 colonnes', (
  select jsonb_object_agg(table_name, cols) from (
    select table_name, jsonb_agg(column_name || ' ' || data_type
             || case when is_nullable = 'NO' then ' NOT NULL' else '' end
             || coalesce(' DEFAULT ' || column_default, '') order by ordinal_position) as cols
    from information_schema.columns where table_schema = 'public' group by table_name) t)
union all
select '03 contraintes', (
  select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'nom', conname, 'def', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
  from pg_constraint where connamespace = 'public'::regnamespace)
union all
select '04 politiques RLS', (
  select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'nom', policyname, 'cmd', cmd,
                                      'roles', roles, 'permissive', permissive, 'using', qual, 'check', with_check) order by schemaname, tablename, policyname)
  from pg_policies where schemaname in ('public', 'storage'))
union all
select '05 droits anon/authenticated', (
  select jsonb_agg(jsonb_build_object('table', table_name, 'role', grantee, 'droits', droits) order by table_name, grantee) from (
    select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as droits
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2) g)
union all
select '06 fonctions public', (
  select jsonb_agg(jsonb_build_object('nom', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'security_definer', p.prosecdef) order by p.proname)
  from pg_proc p where p.pronamespace = 'public'::regnamespace)
union all
select '07 triggers', (
  select jsonb_agg(jsonb_build_object('schema', event_object_schema, 'table', event_object_table, 'nom', trigger_name,
                                      'quand', action_timing, 'evt', event_manipulation, 'action', action_statement))
  from information_schema.triggers where event_object_schema in ('public', 'auth'))
union all
select '08 index', (
  select jsonb_agg(jsonb_build_object('table', tablename, 'def', indexdef) order by tablename, indexname)
  from pg_indexes where schemaname = 'public')
union all
select '09 vues', (select jsonb_agg(table_name) from information_schema.views where table_schema = 'public')
union all
select '10 storage buckets', (select jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limite', file_size_limit)) from storage.buckets)
union all
select '11 storage fichiers', (select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'nb', nb)) from (select bucket_id, count(*) nb from storage.objects group by 1) o)
union all
select '12 comptes auth (comptages)', (
  select jsonb_build_object('comptes', count(*), 'emails_confirmes', count(email_confirmed_at),
                            'premier', min(created_at), 'dernier', max(created_at), 'derniere_connexion', max(last_sign_in_at),
                            'comptes_agents', count(*) filter (where id in (select id from public.agent_profiles)))
  from auth.users)
union all
select '13 extensions', (select jsonb_agg(extname || ' ' || extversion order by extname) from pg_extension);
