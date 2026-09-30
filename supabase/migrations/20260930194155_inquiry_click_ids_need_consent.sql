-- A stored Google Ads click id needs a recorded yes to marketing.
--
-- The contact route stores gclid, gbraid and wbraid only when the request's
-- own consent cookie says yes to marketing, and since
-- 20260930193617_inquiry_lifecycle it also stores that choice on the row
-- (marketing_consent, consent_version, consent_decided_at). This constraint
-- states the rule where the application cannot forget it: a click id may
-- exist only when marketing_consent IS TRUE.
--
-- `is true`, not `= true`: a check constraint passes when its expression is
-- NULL, and `null = true` is NULL. A row without a snapshot must be refused.
--
-- Kept apart from the lifecycle migration on purpose. The intake deployed
-- before the lifecycle code wrote click ids without a snapshot, so in the
-- minutes between that migration and the deployment this rule would have
-- refused a paid lead. Apply this one only after the lifecycle code is live,
-- and after checking that no row with a click id and without a yes exists:
-- adding the constraint validates every existing row, and such a row makes
-- it fail rather than pass in silence.

alter table public.inquiries
  add constraint inquiries_click_ids_need_consent
    check ((gclid is null and gbraid is null and wbraid is null) or marketing_consent is true);

comment on constraint inquiries_click_ids_need_consent on public.inquiries is
  'A Google Ads click id is stored only with a recorded yes to marketing (marketing_consent is true).';
