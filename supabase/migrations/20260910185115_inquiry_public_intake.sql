-- Public intake of website requests.
--
-- The contact form and the project planner create an inquiry while nobody is
-- signed in. The rule is that a visitor may hand in the fields of a request
-- and nothing else, so the privilege system draws that line rather than
-- application code: the insert grant names eight columns, and status,
-- received_at, internal_note and updated_at are not among them. An insert
-- that mentions one of those is rejected by Postgres before any policy runs,
-- so those columns can only ever take their defaults.
--
-- Reading stays admin-only: anon has no SELECT here, and none is granted, so
-- a visitor cannot read back what anyone submitted, not even their own row.
-- Updating and deleting stay admin-only for the same reason.
--
-- The policy repeats the shape of a request as a last line of defence behind
-- the route's own validation.

grant insert (origin, locale, name, email, company, message, phone, planner)
  on table public.inquiries to anon;

drop policy if exists inquiries_public_intake on public.inquiries;
create policy inquiries_public_intake
  on public.inquiries
  for insert
  to anon
  with check (
    status = 'new'
    and internal_note is null
    and length(btrim(name)) between 2 and 200
    and length(btrim(email)) <= 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(btrim(message)) between 1 and 20000
    and length(coalesce(company, '')) <= 200
    and length(coalesce(phone, '')) <= 60
    and (
      planner is null
      or (jsonb_typeof(planner) = 'object' and pg_column_size(planner) <= 65536)
    )
  );
