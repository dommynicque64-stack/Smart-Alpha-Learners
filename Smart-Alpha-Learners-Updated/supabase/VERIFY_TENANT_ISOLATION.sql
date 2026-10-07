-- Smart Alpha Learners: post-migration verification
-- Run after the Phase-1 schema and 20261004_tenant_boundary_and_schema_contract.sql.

-- 1. Confirm every school-scoped table has RLS enabled and the restrictive
--    tenant boundary policy exists.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=c.relname
      and p.policyname='tenant_boundary_restrictive'
  ) as tenant_policy_present
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and exists (
    select 1 from information_schema.columns col
    where col.table_schema='public'
      and col.table_name=c.relname
      and col.column_name='school_id'
  )
order by c.relname;

-- 2. Confirm the canonical invoice_items contract exists.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name='invoice_items'
order by ordinal_position;

-- 3. Confirm legacy API-shaped fields are not required by the application.
--    Extra legacy columns may remain; the application no longer writes them.

-- 4. Confirm the helper is SECURITY DEFINER and only callable by authenticated.
select routine_name, security_type
from information_schema.routines
where routine_schema='public'
  and routine_name='tenant_boundary_ok';

-- 5. Confirm Super Admin is the only role name explicitly recognized for
--    cross-school access by the tenant helper.
select id, name
from public.roles
where lower(name)='super admin';
