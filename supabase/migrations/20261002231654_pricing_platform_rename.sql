-- The highest project type was called "Maatwerkplatform". Every website YM
-- Creations builds is custom-designed, so that name wrongly suggested that
-- only the most expensive type is custom work. The type is about complex
-- functionality (accounts, dashboards, portals, workflows, integrations),
-- so it is named after what it is. Amounts are untouched.

update public.pricing_packages
set
  name_nl = 'Webapplicatie of platform',
  name_en = 'Web application or platform',
  tagline_nl = 'Voor portalen, dashboards en eigen software',
  tagline_en = 'For portals, dashboards and custom software'
where id = 'platform';
