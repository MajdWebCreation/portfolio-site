-- Pricing settings: the temporary discount on development costs.
--
-- One row, and only one: `id` is fixed at 1 by its check, so the table can
-- never hold a second, competing campaign. It sits next to pricing_packages
-- and pricing_addons because it is read with them, by the same public
-- pricing source, and follows their access model exactly.
--
-- The discount applies to one-time development prices only: a package's
-- starting price and its add-ons. It is never applied to
-- monthly_management_from_cents or to anything else that recurs; that rule
-- lives in lib/pricing/discount.ts, and nothing in this table can widen it.
--
-- The stored base prices are never touched by the campaign. Switching it off
-- restores them on the site, because they were never changed.

create table public.pricing_settings (
  id                            smallint primary key default 1 check (id = 1),
  development_discount_enabled  boolean  not null default false,
  development_discount_percent  smallint not null
                                check (development_discount_percent between 1 and 90),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

comment on table public.pricing_settings is
  'Singleton (id = 1) with pricing-wide settings: the temporary discount on one-time development costs.';
comment on column public.pricing_settings.development_discount_enabled is
  'Whether the discount on one-time development prices is shown. Recurring prices are never discounted.';
comment on column public.pricing_settings.development_discount_percent is
  'Whole percentage, 1 through 90. Kept while the discount is switched off.';

create trigger pricing_settings_set_updated_at before update on public.pricing_settings
  for each row execute function private.set_updated_at();

alter table public.pricing_settings enable row level security;
alter table public.pricing_settings force row level security;

revoke all on table public.pricing_settings from anon, authenticated;

-- anon reads, like the rest of the public pricing; it gets no write grant, so
-- Postgres refuses a write before any policy is consulted.
grant select on table public.pricing_settings to anon;
grant select, insert, update, delete on table public.pricing_settings to authenticated;

create policy pricing_settings_public_read
  on public.pricing_settings
  for select
  to anon, authenticated
  using (true);

create policy pricing_settings_admin_all
  on public.pricing_settings
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- The current campaign: 30% on development costs, switched on. Idempotent,
-- and it leaves an existing row alone so re-running cannot undo an admin's
-- later choice.
insert into public.pricing_settings (id, development_discount_enabled, development_discount_percent)
values (1, true, 30)
on conflict (id) do nothing;
