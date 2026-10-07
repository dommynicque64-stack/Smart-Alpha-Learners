-- Smart Alpha Learners production hardening
-- 1) Keep invoice_items aligned with the canonical Elimu schema.
-- 2) Remove API-only library fields that are not part of the canonical schema.
-- 3) Add a PostgreSQL RESTRICTIVE tenant boundary to every school-scoped table.
--    Existing permissive policies may grant a permission, but they cannot cross
--    the school boundary unless the caller has the explicit cross-tenant grant.

begin;

-- Make the canonical invoice_items contract safe to apply to either the
-- supplied Phase-1 schema or an older API-shaped table. Existing data is
-- preserved and migrated when the legacy columns are present.
alter table if exists public.invoice_items
  add column if not exists fee_category_id bigint,
  add column if not exists name text,
  add column if not exists amount numeric(12,2) default 0,
  add column if not exists quantity numeric(12,2) default 1,
  add column if not exists total numeric(12,2) default 0;

do $migration$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='description')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='unit_amount')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='discount_amount')
  then
    execute $sql$
      update public.invoice_items
      set name = coalesce(name, description),
          quantity = coalesce(quantity, 1),
          amount = coalesce(nullif(amount, 0), coalesce(quantity, 1) * coalesce(unit_amount, 0)),
          total = coalesce(nullif(total, 0), greatest(0, coalesce(quantity, 1) * coalesce(unit_amount, 0) - coalesce(discount_amount, 0)))
    $sql$;
  end if;
end $migration$;

-- Canonical invoice_items contract is:
-- fee_category_id, name, amount, quantity, total.
-- The API has been changed to persist these canonical fields and normalize the
-- response back to the UI's description/unit_amount/discount_amount/line_total
-- contract.

-- Library transactions already have notes and do not require fine_amount.

-- Cross-tenant access is intentionally restricted to the explicit `Super Admin` role.

-- The helper must remain SECURITY DEFINER and use the caller JWT, not the
-- service role. This is intentionally only used by authenticated RLS clients.
create or replace function public.tenant_boundary_ok(p_school_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_school_id = public.current_school_id()
     or exists (
       select 1
       from public.app_users u
       join public.roles r on r.id = u.role_id
       where u.auth_user_id = auth.uid()
         and u.status = 'Active'
         and lower(r.name) = 'super admin'
     );
$$;

revoke all on function public.tenant_boundary_ok(bigint) from public;
grant execute on function public.tenant_boundary_ok(bigint) to authenticated;

-- Apply a RESTRICTIVE policy dynamically to every public table that has a
-- school_id column. Restrictive policies are ANDed with existing permissive
-- policies, closing accidental cross-school grants in older policies.
do $$
declare
  r record;
  policy_name text;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1
        from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = c.relname
          and ic.column_name = 'school_id'
      )
  loop
    policy_name := 'tenant_boundary_restrictive';
    execute format('drop policy if exists %I on public.%I', policy_name, r.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.tenant_boundary_ok(school_id)) with check (public.tenant_boundary_ok(school_id))',
      policy_name, r.table_name
    );
  end loop;
end $$;

commit;
