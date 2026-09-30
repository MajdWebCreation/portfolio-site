-- Lead quality per channel, from the reporting contract `inquiry_funnel`
-- (migration 20260930193617_inquiry_lifecycle).
--
-- Run in the Supabase SQL editor (read-only). Vocabulary, so nothing is
-- confused later:
--
--   genuine               not lost as spam or duplicate: the base of every rate
--   reached_qualified_at  earliest evidence of qualified or later (a won lead
--                         was qualified); reached_contacted_at likewise
--   explicit_contacted_at the RECORDED contact only: use it for response
--                         time, never reached_contacted_at
--   quote_sent_at         an explicit "Offerte verstuurd" only
--   won_at / lost_at      only while the current status is won / lost
--   quoted / won / recurring value
--                         business snapshots at the row (current), EUR excl.
--                         VAT; the value at the moment of the outcome is on
--                         inquiry_status_events
--   invoiced_net_cents / paid_gross_cents
--                         realised revenue through the customer: accounting
--                         truth, kept apart from the snapshots
--   ads_campaign_id       Google Ads campaign id (utm_campaign={campaignid})
--   ads_matched_keyword   the keyword Google MATCHED (utm_term={keyword}),
--                         not the search term the visitor typed, which is
--                         not captured per inquiry (Google Ads' search terms
--                         report is the only source of that)
--   ads_creative_id       the ad id (utm_content={creative})
--   ads_adgroup_id / ads_match_type
--                         {adgroupid} / {matchtype} from the landing URL
--
-- Adjust the date filter to the campaign period.

with f as (
  select *
  from public.inquiry_funnel
  where received_at >= date '2026-10-01'
)
select
  coalesce(traffic_class, 'unknown') as traffic_class,
  traffic_source,
  traffic_medium,
  ads_campaign_id,
  ads_matched_keyword,
  ads_match_type,
  count(*) filter (where genuine)                                                  as leads,
  count(*) filter (where not genuine)                                              as spam_or_duplicate,
  count(*) filter (where has_ads_click)                                            as with_ads_click,
  count(*) filter (where genuine and reached_qualified_at is not null)             as qualified,
  count(*) filter (where quote_sent_at is not null)                                as quoted,
  count(*) filter (where won_at is not null)                                       as won,
  count(*) filter (where lost_at is not null and genuine)                          as lost,
  round(avg(extract(epoch from (explicit_contacted_at - received_at)) / 3600.0) filter (where explicit_contacted_at is not null), 1)
                                                                                   as hours_to_recorded_contact,
  coalesce(sum(quoted_value_cents), 0) / 100.0                                     as quoted_value_eur,
  coalesce(sum(won_value_cents) filter (where won_at is not null), 0) / 100.0      as won_one_off_eur,
  coalesce(sum(recurring_monthly_cents) filter (where won_at is not null), 0) / 100.0
                                                                                   as won_monthly_eur,
  coalesce(sum(invoiced_net_cents), 0) / 100.0                                     as invoiced_net_eur,
  coalesce(sum(paid_gross_cents), 0) / 100.0                                       as paid_gross_eur
from f
group by 1, 2, 3, 4, 5, 6
order by leads desc;

-- Per lost reason, to see what a keyword brings in.
-- select lost_reason, ads_matched_keyword, count(*) from public.inquiry_funnel
-- where lost_at is not null group by 1, 2 order by 3 desc;
