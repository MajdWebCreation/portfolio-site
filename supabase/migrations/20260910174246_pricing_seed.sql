-- Pricing seed: the current values from lib/pricing/packages.ts.
--
-- Generated from that module, not retyped: 5 project types and 25 add-ons,
-- with the same ids, the same amounts and the same modes. Euro amounts are
-- multiplied by 100 into integer cents; no price is changed.
--
-- Idempotent, so re-running the migration cannot introduce a second model.

insert into public.pricing_packages
  (id, starting_price_cents, scope_driven, monthly_management_from_cents,
   name_nl, name_en, tagline_nl, tagline_en, sort_order)
values
  ('starter', 69500, false, 1000, 'Compacte website', 'Compact website', 'Voor presentatie en contact', 'For presentation and contact', 0),
  ('business', 149500, false, 2500, 'Bedrijfswebsite', 'Business website', 'Voor meer pagina''s en structuur', 'For more pages and structure', 1),
  ('smart', 249500, false, 3500, 'Website met reserveringen', 'Website with bookings', 'Voor aanvragen en reserveringen', 'For requests and bookings', 2),
  ('webshop', 199500, false, 2500, 'Webshop', 'Webshop', 'Voor online verkoop', 'For selling online', 3),
  ('platform', 499500, true, 4900, 'Maatwerkplatform', 'Custom platform', 'Voor portalen, workflows en maatwerk', 'For portals, workflows and custom work', 4)
on conflict (id) do update set
  starting_price_cents = excluded.starting_price_cents,
  scope_driven = excluded.scope_driven,
  monthly_management_from_cents = excluded.monthly_management_from_cents,
  name_nl = excluded.name_nl,
  name_en = excluded.name_en,
  tagline_nl = excluded.tagline_nl,
  tagline_en = excluded.tagline_en,
  sort_order = excluded.sort_order;

insert into public.pricing_addons
  (package_id, addon_id, addon_group, amount_cents, mode, label_nl, label_en, sort_order)
values
  ('starter', 'extra-page', 'content', 7500, 'plus', 'Extra pagina', 'Extra page', 0),
  ('starter', 'multilingual', 'content', 20000, 'plus', 'Tweede taal', 'Second language', 1),
  ('starter', 'seo-plus', 'findability', 25000, 'plus', 'Uitgebreidere zoekmachineoptimalisatie', 'Extended search engine optimisation', 2),
  ('starter', 'motion', 'conversion', 17500, 'plus', 'Subtiele animatie en interactie', 'Subtle animation and interaction', 3),
  ('business', 'extra-page', 'content', 7500, 'plus', 'Extra pagina', 'Extra page', 0),
  ('business', 'seo-growth', 'findability', 35000, 'plus', 'SEO op zoekintentie en pagina-opbouw', 'SEO on search intent and page structure', 1),
  ('business', 'email-flow', 'conversion', 20000, 'plus', 'Uitgebreidere e-mailflow na een aanvraag', 'Extended email flow after an enquiry', 2),
  ('business', 'content-admin', 'management', 45000, 'plus-from', 'Eigen beheeromgeving voor content', 'Own admin environment for content', 3),
  ('business', 'light-api', 'integrations', 55000, 'plus-from', 'Eenvoudige koppeling met een extern systeem', 'Simple connection to an external system', 4),
  ('smart', 'payments', 'conversion', 65000, 'plus', 'Online betalingen', 'Online payments', 0),
  ('smart', 'reminders', 'conversion', 25000, 'plus', 'Herinneringsmails en automatisering', 'Reminder emails and automation', 1),
  ('smart', 'expanded-admin', 'management', 95000, 'plus-from', 'Uitgebreidere beheeromgeving', 'Extended admin environment', 2),
  ('smart', 'maps-routes', 'integrations', 125000, 'plus-from', 'Kaarten, routes en prijs per kilometer', 'Maps, routes and price per kilometre', 3),
  ('smart', 'crm-calendar', 'integrations', 65000, 'plus-from', 'Koppeling met CRM of agenda', 'Connection to CRM or calendar', 4),
  ('webshop', 'multilingual', 'content', 20000, 'plus', 'Tweede taal', 'Second language', 0),
  ('webshop', 'product-seo', 'findability', 45000, 'plus', 'SEO voor categorie- en productpagina''s', 'SEO for category and product pages', 1),
  ('webshop', 'filters-search', 'conversion', 45000, 'plus', 'Uitgebreide filters en zoeken', 'Extended filters and search', 2),
  ('webshop', 'subscriptions', 'conversion', 90000, 'plus-from', 'Abonnementen of lidmaatschappen', 'Subscriptions or memberships', 3),
  ('webshop', 'erp-crm', 'integrations', 75000, 'plus-from', 'Koppeling met CRM, ERP of boekhouding', 'Connection to CRM, ERP or accounting', 4),
  ('platform', 'extra-roles', 'management', 75000, 'plus', 'Extra gebruikersrollen', 'Extra user roles', 0),
  ('platform', 'reporting', 'management', 75000, 'plus-from', 'Rapportages en inzichten', 'Reports and insights', 1),
  ('platform', 'notifications', 'conversion', 35000, 'plus', 'Notificaties', 'Notifications', 2),
  ('platform', 'complex-api', 'integrations', 150000, 'plus-from', 'Complexe koppeling met externe systemen', 'Complex connection to external systems', 3),
  ('platform', 'mobile-app', 'app', 350000, 'plus-from', 'Mobiele app als uitbreiding', 'Mobile app as an extension', 4),
  ('platform', 'full-app', 'app', 850000, 'from', 'Volledig app-traject', 'Full app project', 5)
on conflict (package_id, addon_id) do update set
  addon_group = excluded.addon_group,
  amount_cents = excluded.amount_cents,
  mode = excluded.mode,
  label_nl = excluded.label_nl,
  label_en = excluded.label_en,
  sort_order = excluded.sort_order;
