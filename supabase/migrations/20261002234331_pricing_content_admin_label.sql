-- The business website includes editing existing text and images yourself.
-- The "content-admin" extension is the level above that: managing projects,
-- testimonials and sections as well. Its label said "own admin environment
-- for content", which promised the same thing as the standard; it now names
-- what the extension adds. The amount is untouched.

update public.pricing_addons
set
  label_nl = 'Beheeromgeving voor projecten, referenties en secties',
  label_en = 'Admin environment for projects, testimonials and sections'
where package_id = 'business' and addon_id = 'content-admin';
