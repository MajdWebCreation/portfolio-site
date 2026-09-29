-- Article links to the renamed service page.
--
-- The business website page moved from /nl/diensten/bedrijfswebsite to
-- /nl/diensten/website-laten-maken. next.config.ts redirects the old path
-- permanently, so nothing breaks either way; this points the links in the
-- article bodies straight at the new address, without the extra hop.
--
-- APPLY ONLY AFTER the code with the new route is deployed: before that, the
-- new path does not exist yet and these links would lead to a 404.
--
-- Only exact path matches: the lookahead leaves any longer slug alone.
-- Idempotent: a second run finds nothing to replace.

update public.articles
set content = regexp_replace(
  content::text,
  '/nl/diensten/bedrijfswebsite(?![a-z0-9-])',
  '/nl/diensten/website-laten-maken',
  'g'
)::jsonb
where content::text ~ '/nl/diensten/bedrijfswebsite(?![a-z0-9-])';
