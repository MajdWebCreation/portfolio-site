-- Public read access to pricing.
--
-- The public pricing page and the project planner now read their amounts from
-- this table instead of from a TypeScript module, so anon needs SELECT. It
-- gets exactly that: read, on active rows only, and nothing else. Writing
-- stays with active admins, through the policies from the pricing migration.
--
-- `is_active` is the switch that decides what the public sees. A row that is
-- switched off keeps its history and stays visible to the admin, but no
-- longer reaches a visitor.

alter table public.pricing_packages add column if not exists is_active boolean not null default true;
alter table public.pricing_addons  add column if not exists is_active boolean not null default true;

comment on column public.pricing_packages.is_active is
  'Public visibility. Only active rows are readable by anon.';
comment on column public.pricing_addons.is_active is
  'Public visibility. Only active rows are readable by anon.';

-- Least privilege on the grants: anon may read, and may not write.
grant select on table public.pricing_packages to anon;
grant select on table public.pricing_addons  to anon;

drop policy if exists pricing_packages_public_read on public.pricing_packages;
create policy pricing_packages_public_read
  on public.pricing_packages
  for select
  to anon, authenticated
  using (is_active);

-- An add-on is public when it is active itself and its package is public, so
-- switching off a package cannot leave its extensions visible.
drop policy if exists pricing_addons_public_read on public.pricing_addons;
create policy pricing_addons_public_read
  on public.pricing_addons
  for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1
      from public.pricing_packages p
      where p.id = package_id
        and p.is_active
    )
  );
