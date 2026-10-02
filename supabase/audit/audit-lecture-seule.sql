-- ============================================================
-- Nzoko Transport — Audit de la base (LECTURE SEULE)
-- Uniquement des SELECT sur les catalogues : ne modifie rien.
-- Aucune donnée personnelle (pas d'emails, noms ni téléphones).
-- ============================================================

-- 1. Tables et état de la RLS
select c.relname as table_name, c.relrowsecurity as rls_active, c.relforcerowsecurity as rls_forcee
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2. Colonnes
select table_name,
       string_agg(column_name || ' ' || data_type
                  || case when is_nullable = 'NO' then ' NOT NULL' else '' end
                  || coalesce(' DEFAULT ' || column_default, ''), ' | ' order by ordinal_position) as colonnes
from information_schema.columns
where table_schema = 'public'
group by 1 order by 1;

-- 3. Contraintes (clés primaires, étrangères, unicité, CHECK)
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by 1, 2;

-- 4. Politiques RLS
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2;

-- 5. Droits des rôles anon / authenticated
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as droits
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- 6. Fonctions du schéma public
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments, p.prosecdef as security_definer
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by 1;

-- 7. Triggers (public et auth)
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth')
order by 1, 2, 3;

-- 8. Index
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by 1, 2;

-- 9. Vues
select table_name from information_schema.views where table_schema = 'public';

-- 10. Storage
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select bucket_id, count(*) as fichiers from storage.objects group by 1;

-- 11. Comptes Auth (comptages uniquement)
select count(*) as comptes,
       count(email_confirmed_at) as emails_confirmes,
       min(created_at) as premier_compte,
       max(created_at) as dernier_compte,
       max(last_sign_in_at) as derniere_connexion,
       count(*) filter (where id in (select id from public.agent_profiles)) as comptes_agents
from auth.users;
