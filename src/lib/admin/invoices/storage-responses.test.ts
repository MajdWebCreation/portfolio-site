import { describe, expect, it } from "vitest";
import { storageSaysAlreadyExists } from "@/lib/admin/invoices/artifact";

/**
 * The two refusals this bucket really produces, copied verbatim from a run
 * against a local Supabase stack (storage-api v1.73.1).
 *
 * The adopt flow hangs on telling them apart: one means "someone else stored
 * this document first, use theirs", the other means "you tried to replace a
 * document, and that is never allowed". Getting them the wrong way round
 * would either lose a finalization or hide a real problem, and neither shows
 * up in a test that invents its own error shape.
 */
const duplicate = {
  message: "The resource already exists",
  name: "StorageApiError",
  status: 400,
  statusCode: "409",
  code: "KeyAlreadyExists",
};

const overwriteRefused = {
  message: "new row violates row-level security policy",
  name: "StorageApiError",
  status: 400,
  statusCode: "403",
  code: "AccessDenied",
};

describe("recognising Supabase Storage's answer to a second upload", () => {
  it("recognises the real duplicate response", () => {
    expect(storageSaysAlreadyExists(duplicate)).toBe(true);
  });

  /* `status` is 400 there, so reading that field alone would miss it. */
  it("does not rely on the HTTP status field alone", () => {
    expect(duplicate.status).toBe(400);
    expect(storageSaysAlreadyExists({ ...duplicate, code: undefined, message: "" })).toBe(true);
    expect(storageSaysAlreadyExists({ ...duplicate, statusCode: undefined, message: "" })).toBe(true);
    expect(storageSaysAlreadyExists({ ...duplicate, code: undefined, statusCode: undefined })).toBe(true);
  });

  /* A bucket that refuses an overwrite is not a document to adopt. */
  it("does not mistake the row-level security refusal for a duplicate", () => {
    expect(storageSaysAlreadyExists(overwriteRefused)).toBe(false);
  });

  it("treats anything else as the failure it is", () => {
    expect(storageSaysAlreadyExists({ message: "Payload too large", status: 413, statusCode: "413" })).toBe(false);
    expect(storageSaysAlreadyExists({ message: "fetch failed" })).toBe(false);
  });
});
