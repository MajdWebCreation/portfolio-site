-- Lead quality per channel: inquiry -> qualified -> quote -> won -> paid revenue.
--
-- Run in the Supabase SQL editor (read-only). Every step comes from data the
-- admin already keeps; nothing extra has to be filled in:
--
--   inquiry    public.inquiries (date = received_at, channel = traffic_*,
--              campaign/utm_term, Google Ads click = gclid/gbraid/wbraid)
--   qualified  inquiry status set to "qualified" in the admin, or converted
--              to a customer ("Klant aanmaken" sets customers.source_inquiry_id)
--   quoted     a quote for that customer that was sent (sent/accepted/
--              rejected/expired)
--   won        a quote for that customer with status "accepted"
--   revenue    payments with status "paid" for that customer (euros, incl.
--              VAT as charged); swap in invoice lines for an excl.-VAT figure
--
-- The one manual habit this needs: convert a real prospect to a customer from
-- the inquiry (not by creating a fresh customer), and mark quotes accepted.
-- Adjust the date filter to the campaign period.

with base as (
  select i.id, i.received_at::date as day, i.origin, i.status,
         coalesce(i.traffic_class, 'unknown') as traffic_class,
         i.traffic_source, i.traffic_medium, i.campaign, i.utm_term,
         (i.gclid is not null or i.gbraid is not null or i.wbraid is not null) as has_ads_click,
         c.id as customer_id
  from public.inquiries i
  left join public.customers c on c.source_inquiry_id = i.id
  where i.received_at >= date '2026-10-01'
), quotes_agg as (
  select q.customer_id,
         count(*) filter (where q.status in ('sent', 'accepted', 'rejected', 'expired')) as quotes_sent,
         count(*) filter (where q.status = 'accepted') as quotes_accepted
  from public.quotes q
  group by q.customer_id
), revenue as (
  select p.customer_id, sum(p.amount_cents) filter (where p.status = 'paid') as paid_cents
  from public.payments p
  group by p.customer_id
)
select b.traffic_class, b.traffic_source, b.traffic_medium, b.campaign,
       count(*) as inquiries,
       count(*) filter (where b.has_ads_click) as with_ads_click,
       count(*) filter (where b.status = 'qualified' or b.customer_id is not null) as qualified,
       count(*) filter (where coalesce(qa.quotes_sent, 0) > 0) as quoted,
       count(*) filter (where coalesce(qa.quotes_accepted, 0) > 0) as won,
       coalesce(sum(r.paid_cents), 0) / 100.0 as paid_revenue_eur
from base b
left join quotes_agg qa on qa.customer_id = b.customer_id
left join revenue r on r.customer_id = b.customer_id
group by 1, 2, 3, 4
order by inquiries desc;
