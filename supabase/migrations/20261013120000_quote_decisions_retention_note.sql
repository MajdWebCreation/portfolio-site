-- Documentation only: the table comment of quote_decisions said the record is
-- kept for a statutory period. That is a legal question nobody has decided
-- for these rows; what is true is technical. The comment now says that.

comment on table public.quote_decisions is
  'The decision on a sent quote: accepted or rejected, once per quote. Append-only by design: no role may update or delete a row and triggers refuse it. Carries the hash of the exact stored PDF and the terms set the quote was issued under, and is the only writer of quotes.status accepted/rejected. Holds personal data (actor_email, rejection_reason); the retention job does not touch it, and any removal or anonymisation would be an explicit future retention rule with its own migration.';
