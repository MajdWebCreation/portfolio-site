-- Websitecheck requests.
--
-- A third origin next to the contact form and the project planner. The
-- /websitecheck landing page asks for a website address, a name, an email
-- address and optionally a phone number, and nothing else. The address gets
-- its own column, so the admin can show and filter it without parsing text;
-- the message column stays, empty, because a websitecheck has no message.
--
-- `origin = 'websitecheck'` says what kind of request this is. Where the
-- visit came from (Meta, a search engine, a campaign) is a different thing
-- and stays in the attribution columns, which are untouched here.
--
-- The visitor's insert grant grows by exactly this one column. The policy
-- repeats the shape the route enforces, as the last line behind it.

alter table public.inquiries
  add column website_url text
    check (length(website_url) <= 500 and website_url ~ '^https?://[^[:space:]<>"''`\\]+$');

comment on column public.inquiries.website_url is
  'The website a websitecheck was requested for, normalised to an absolute http(s) URL; null for other origins.';

alter table public.inquiries drop constraint inquiries_origin_check;
alter table public.inquiries
  add constraint inquiries_origin_check
  check (origin in ('contact', 'project_planner', 'websitecheck'));

-- One shape per origin: the planner carries its block, the contact form
-- neither a phone nor a block, the websitecheck an address and, optionally,
-- a phone number.
alter table public.inquiries drop constraint inquiries_origin_shape;
alter table public.inquiries
  add constraint inquiries_origin_shape check (
    (origin = 'project_planner' and planner is not null and website_url is null)
    or (origin = 'contact' and planner is null and phone is null and website_url is null)
    or (origin = 'websitecheck' and planner is null and website_url is not null)
  );

comment on table public.inquiries is 'Incoming website requests: contact form, project planner and websitecheck.';

grant insert (website_url) on table public.inquiries to anon;

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
    -- A websitecheck has no message; every other request has one.
    and length(btrim(message)) <= 20000
    and (origin = 'websitecheck' or length(btrim(message)) >= 1)
    and length(coalesce(company, '')) <= 200
    and length(coalesce(phone, '')) <= 60
    and (
      planner is null
      or (jsonb_typeof(planner) = 'object' and pg_column_size(planner) <= 65536)
    )
    and (traffic_source is null or traffic_source ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (traffic_medium is null or traffic_medium ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (campaign is null or campaign ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (landing_path is null or landing_path ~ '^/[^[:space:][:cntrl:]<>"''`\\]*$')
  );
