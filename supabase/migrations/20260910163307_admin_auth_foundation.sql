-- Admin authentication foundation.
--
-- Being a signed-in Supabase user grants nothing. Access to /admin is granted
-- by an active row in public.admin_profiles and by nothing else: not by an
-- email address, not by a claim in the JWT, not by the mere fact of being
-- authenticated. Rows are created out of band (Supabase dashboard or SQL
-- editor, both of which run as a BYPASSRLS role); the application has no path
-- to create or modify one, so admin rights cannot be self-assigned.

-- Schema for helpers that must stay out of the PostgREST API. Only `public`,
-- `graphql_public` and `storage` are exposed, so nothing in here is reachable
-- over /rest/v1; RLS policies can still call into it.
create schema if not exists private;
comment on schema private is 'Internal helpers, deliberately not exposed through the API.';

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.admin_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.admin_profiles is
  'Explicit allowlist of admin users. An active row here is the only thing that grants /admin access.';
comment on column public.admin_profiles.is_active is
  'Revokes access without deleting the row or the auth user.';

-- Keep updated_at honest. Returns `trigger`, so it can only ever be reached
-- from the trigger below, never called directly.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function private.set_updated_at();

-- Row level security.
--
-- FORCE applies the policies to the table owner as well, so only a role with
-- BYPASSRLS (postgres, service_role) can write. Least privilege on the grants
-- too: authenticated may read, nothing more; anon has no access at all.
alter table public.admin_profiles enable row level security;
alter table public.admin_profiles force row level security;

revoke all on table public.admin_profiles from anon, authenticated;
grant select on table public.admin_profiles to authenticated;

-- A signed-in user may read their own row and no one else's, so the admin set
-- is not enumerable by a normal user. A non-admin simply reads zero rows.
drop policy if exists admin_profiles_select_own on public.admin_profiles;
create policy admin_profiles_select_own
  on public.admin_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Deliberately no insert, update or delete policy: with RLS forced, every
-- write from anon or authenticated is denied, whatever the application does.

-- Helper for the RLS policies of later phases, so tables holding business data
-- can say `using (private.is_admin())` instead of repeating this subquery.
-- SECURITY DEFINER because such a policy may run for a caller that cannot read
-- the row it needs; the empty search_path keeps the body unshadowable, and the
-- private schema keeps it off the REST API.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active
  );
$$;

comment on function private.is_admin() is
  'True when the current request belongs to an active admin. For use in RLS policies of later phases.';

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
