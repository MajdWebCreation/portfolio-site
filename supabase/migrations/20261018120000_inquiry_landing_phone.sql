-- A contact request may carry a phone number.
--
-- The landing page of a service (first: /nl/diensten/website-laten-maken,
-- the Google Ads landing) asks for an optional phone number next to the
-- email address, because a visitor on a phone often prefers to be called
-- back. Until now the shape constraint allowed a number only on the
-- planner and the websitecheck; a contact request had to have none. The
-- plain contact form still sends none (the route drops it), so nothing
-- else changes: planner still needs its block, websitecheck its address.
--
-- The intake policy already bounds the number to 60 characters for every
-- origin, and `anon` already holds the INSERT grant on `phone`.
alter table public.inquiries drop constraint inquiries_origin_shape;
alter table public.inquiries
  add constraint inquiries_origin_shape check (
    (origin = 'project_planner' and planner is not null and website_url is null)
    or (origin = 'contact' and planner is null and website_url is null)
    or (origin = 'websitecheck' and planner is null and website_url is not null)
  );
