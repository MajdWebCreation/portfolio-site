-- Pricing update, 29 September 2026: new monthly technical management fees.
--
-- The one-time starting prices and every add-on amount already match the
-- definitive price list; only technical management changes. Amounts in
-- integer cents, excluding VAT. Idempotent: re-running sets the same values.

update public.pricing_packages as p
set monthly_management_from_cents = v.cents
from (values
  ('starter', 1500),
  ('business', 2900),
  ('smart', 3900),
  ('webshop', 3500),
  ('platform', 6900)
) as v (id, cents)
where p.id = v.id
  and p.monthly_management_from_cents is distinct from v.cents;
