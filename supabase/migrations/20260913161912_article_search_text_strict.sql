-- Elke tekst in `articles.search_text` stond er twee keer in.
--
-- `20260913161156_article_search_text.sql` haalt de tekstnodes uit het
-- document met de jsonpath `$.**.text`. Die draait in lax-modus, en lax
-- ontvouwt arrays: elke tekstnode wordt zowel via de array als via het
-- element bereikt, dus elke node komt er twee keer uit. Gemeten over de
-- twintig artikelen: 3.934 nodes waar er 1.967 zijn.
--
-- Zoeken werd er niet fout van -- een woord dat twee keer in de kolom staat
-- verandert niets aan een `like` -- maar de kolom is er het dubbele van.
-- `strict $.**.text` loopt dezelfde boom af zonder die ontvouwing. Op de
-- huidige artikelen levert dat exact dezelfde verzameling waarden, elk één
-- keer: gecontroleerd op alle vierentwintig rijen, geen waarde die de lax-
-- variant wel vond en deze niet.
--
-- Strict betekent hier niet "streng over ontbrekende velden": `**` is een
-- recursieve wildcard, dus een document zonder tekstnodes -- een leeg
-- artikel, of `content` dat null is -- levert gewoon een lege lijst en geen
-- fout. Getest met beide gevallen.
--
-- Twee statements, want een van de twee alleen doet niets:
--
--  1. De functie vervangen verandert alleen wat toekomstige schrijfacties
--     opleveren. Een stored generated column wordt berekend bij het
--     schrijven, dus de bestaande vierentwintig rijen zouden hun dubbele
--     tekst houden -- en de kolom zou niet meer overeenkomen met zijn eigen
--     expressie.
--  2. `set expression` met dezelfde expressietekst is daarom geen no-op: het
--     is wat de tabel laat herschrijven, waardoor elke rij opnieuw wordt
--     berekend met de functie hierboven. De index wordt bij die herschrijving
--     meegebouwd, dus `articles_search_text_idx` hoeft niet weg en terug.
--
-- Bewust geen drop/recreate van de kolom: dat zou de kolom achteraan de
-- tabel zetten, de rechten erop opnieuw moeten regelen en een moment
-- opleveren waarop de kolom niet bestaat. `set expression` (PostgreSQL 17)
-- raakt geen policies, geen grants en geen andere kolom, en verandert geen
-- artikelinhoud: `title`, `slug`, `excerpt` en `content` worden alleen
-- gelezen.

create or replace function private.article_search_text(
  title text,
  slug text,
  excerpt text,
  content jsonb
) returns text
  language sql
  immutable
  parallel safe
  set search_path = ''
as $$
  select lower(
    trim(
      concat_ws(
        ' ',
        title,
        slug,
        excerpt,
        (
          select string_agg(node #>> '{}', ' ')
          from pg_catalog.jsonb_array_elements(
            pg_catalog.jsonb_path_query_array(coalesce(content, '{}'::jsonb), 'strict $.**.text')
          ) as node
        )
      )
    )
  );
$$;

alter table public.articles
  alter column search_text
  set expression as (private.article_search_text(title, slug, excerpt, content));
