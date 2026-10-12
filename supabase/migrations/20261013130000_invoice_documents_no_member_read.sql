-- Members no longer read the invoice-documents bucket themselves.
--
-- The portal served a stored PDF by reading the object under the member's
-- session, allowed by the storage policy invoice_documents_portal_read. That
-- same policy let a member list their customer's objects and sign a URL to
-- one, valid for as long as they chose -- a link that outlives a revoked
-- membership. Request attachments were closed the same way in
-- customer_requests_hardening; documents follow: the member's session
-- proves ownership through portal_document, and the server reads exactly
-- that object on its own client (privileged.ts, readPortalDocumentFile).
--
-- The helper stays, unreachable: no policy uses it and no client role may
-- execute it.

drop policy if exists invoice_documents_portal_read on storage.objects;

revoke execute on function private.portal_can_read_document(text) from authenticated;
