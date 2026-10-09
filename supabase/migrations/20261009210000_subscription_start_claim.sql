/*
  Starting a service's monthly collection exactly once.

  Mollie's Idempotency-Key is remembered for one hour, so on its own it cannot
  stop a second subscription from a retry the next day -- or from a retry
  after Mollie created the first one and our write of its id failed. The
  guarantee therefore lives here:

    - `mollie_subscription_id` holds the one current subscription of a
      service (a single column, unique across services);
    - before Mollie is called, an attempt claims the service by writing its
      own claim id, but only while the row is exactly as it read it -- a
      compare-and-swap, so of two simultaneous clicks one wins and the other
      is told the start is already in progress;
    - the subscription id is only recorded under that same claim, and the
      claim is cleared with it.

  A claim that outlives any request (the process died between Mollie and the
  write) is treated as abandoned after a few minutes. The attempt that takes
  it over first asks Mollie for a subscription carrying this service's id and
  adopts it, rather than creating another.
*/
alter table public.recurring_services
  add column subscription_claim_id uuid,
  add column subscription_claimed_at timestamptz,
  add constraint recurring_services_subscription_claim_complete
    check ((subscription_claim_id is null) = (subscription_claimed_at is null));

comment on column public.recurring_services.subscription_claim_id is
  'The attempt currently starting this service''s subscription; cleared once the subscription id is recorded.';
comment on column public.recurring_services.subscription_claimed_at is
  'When that attempt claimed it; a claim older than a few minutes is treated as abandoned.';
