-- What a sent document remembers.
--
-- Both columns are written only after Resend has accepted the message, so a
-- filled `sent_at` means the mail really left. A failed send leaves them null
-- and the status untouched, which is what makes a retry safe.
--
-- `recipient_email` is the address the PDF actually went to, kept separately
-- from the customer snapshot: the snapshot says who the document is for, this
-- says where it was delivered.

alter table public.quotes
  add column sent_at         timestamptz,
  add column recipient_email text;

alter table public.invoices
  add column sent_at         timestamptz,
  add column recipient_email text;

comment on column public.quotes.sent_at is
  'Set only after the mail was accepted; null means it was never sent.';
comment on column public.invoices.sent_at is
  'Set only after the mail was accepted; null means it was never sent.';
