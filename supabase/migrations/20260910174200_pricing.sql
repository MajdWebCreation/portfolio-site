-- Pricing: project types and their add-ons.
--
-- Mirrors PackageDefinition / AddOnDefinition in lib/pricing/packages.ts. Ids
-- are the existing string ids ('starter', 'extra-page', ...), not generated
-- uuids, so a row and a PackageId keep referring to the same thing.
--
-- Amounts are integer cents here, while the source module and the admin model
-- speak whole euros; the repository converts at the boundary. Nothing outside
-- the admin reads this table in this phase: the public pricing page and the
-- planner still read lib/pricing/packages.ts.
--
-- An add-on id is only unique within a package ('extra-page' belongs to both
-- starter and business, 'multilingual' to starter and webshop), so the key is
-- the pair.

create table public.pricing_packages (
  id                            text primary key
                                check (id in ('starter', 'business', 'smart', 'webshop', 'platform')),
  starting_price_cents          integer not null check (starting_price_cents >= 0),
  scope_driven                  boolean not null default false,
  monthly_management_from_cents integer not null check (monthly_management_from_cents >= 0),
  name_nl                       text not null,
  name_en                       text not null,
  tagline_nl                    text not null,
  tagline_en                    text not null,
  sort_order                    integer not null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint pricing_packages_sort_order_unique unique (sort_order)
);

comment on table public.pricing_packages is 'Project types; amounts in integer cents.';
comment on column public.pricing_packages.scope_driven is 'Custom work: the starting price is a lower bound.';

create table public.pricing_addons (
  package_id   text not null references public.pricing_packages (id) on delete cascade,
  addon_id     text not null check (length(btrim(addon_id)) > 0),
  addon_group  text not null
               check (addon_group in ('content', 'findability', 'conversion', 'management', 'integrations', 'app')),
  amount_cents integer not null check (amount_cents >= 0),
  mode         text not null check (mode in ('plus', 'plus-from', 'from')),
  label_nl     text not null,
  label_en     text not null,
  sort_order   integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (package_id, addon_id),
  constraint pricing_addons_sort_order_unique unique (package_id, sort_order)
);

comment on table public.pricing_addons is 'Add-ons per project type; an addon_id is unique within its package only.';

create index pricing_addons_package_idx on public.pricing_addons (package_id, sort_order);

create trigger pricing_packages_set_updated_at before update on public.pricing_packages
  for each row execute function private.set_updated_at();
create trigger pricing_addons_set_updated_at before update on public.pricing_addons
  for each row execute function private.set_updated_at();

alter table public.pricing_packages enable row level security;
alter table public.pricing_packages force row level security;
alter table public.pricing_addons enable row level security;
alter table public.pricing_addons force row level security;

revoke all on table public.pricing_packages from anon, authenticated;
revoke all on table public.pricing_addons from anon, authenticated;

grant select, insert, update, delete on table public.pricing_packages to authenticated;
grant select, insert, update, delete on table public.pricing_addons to authenticated;

create policy pricing_packages_admin_all on public.pricing_packages
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy pricing_addons_admin_all on public.pricing_addons
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
