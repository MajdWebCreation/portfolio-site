import { invoiceDocumentBucket, sha256Hex } from "@/lib/admin/invoices/artifact";

/**
 * A bucket in memory, for tests that have to follow one PDF from the moment
 * it is stored to the moment it is attached to a mail.
 *
 * Nothing here talks to Supabase; it is the small subset of the storage client
 * this code uses -- upload and download -- keyed by path, holding the exact
 * bytes it was given. That is the point: a test can assert that what came out
 * is byte-for-byte what went in, which is the whole claim the artifact design
 * makes.
 */
export const fixturePdfBytes = Buffer.from("%PDF-1.7\n% a fixture, not a real document\n%%EOF\n");

export const fixturePdfSha256 = sha256Hex(fixturePdfBytes);

/** Where those bytes live: number plus their own hash, as the real path is built. */
export const fixtureDocumentPath = `2026/YM-F-2026-000001-${fixturePdfSha256}.pdf`;

export type FakeStorage = {
  /** Every object currently in the bucket, by path. */
  files: Map<string, Buffer>;
  /** Uploads that actually wrote an object. */
  uploads: { path: string; bytes: number }[];
  /** Uploads the bucket refused because the object was already there. */
  refusedUploads: { path: string; bytes: number }[];
  downloads: string[];
  /** Fails the next upload with this message, once. */
  failNextUpload: (message: string) => void;
  /** The `storage` half of a Supabase client. */
  storage: { from: (bucket: string) => unknown };
};

export function fakeInvoiceStorage(seed: Record<string, Buffer> = {}): FakeStorage {
  const files = new Map<string, Buffer>(Object.entries(seed));
  const uploads: { path: string; bytes: number }[] = [];
  const refusedUploads: { path: string; bytes: number }[] = [];
  const downloads: string[] = [];
  let uploadFailure: string | null = null;

  const bucket = {
    /*
      The real bucket's behaviour, including the half that matters most: with
      `upsert: false` an existing object is not replaced but refused, with
      the 409 the storage API returns. And `invoice-documents` has no update
      policy at all, so a caller asking for an overwrite is refused too --
      the same answer, from the database instead of from here.
    */
    async upload(path: string, body: Uint8Array, options?: { upsert?: boolean }) {
      if (uploadFailure) {
        const message = uploadFailure;
        uploadFailure = null;
        return { data: null, error: { message } };
      }
      if (files.has(path)) {
        refusedUploads.push({ path, bytes: body.byteLength });
        return {
          data: null,
          error: options?.upsert
            ? { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }
            : { statusCode: "409", error: "Duplicate", message: "The resource already exists" },
        };
      }
      files.set(path, Buffer.from(body));
      uploads.push({ path, bytes: body.byteLength });
      return { data: { path }, error: null };
    },
    /* The prefix listing `storeInvoiceArtifact` uses to find an earlier render. */
    async list(folder: string, options?: { search?: string }) {
      const prefix = `${folder}/${options?.search ?? ""}`;
      const names = [...files.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => ({ name: path.slice(folder.length + 1) }));
      return { data: names, error: null };
    },
    async download(path: string) {
      downloads.push(path);
      const file = files.get(path);
      if (!file) return { data: null, error: { message: "Object not found" } };
      return {
        data: {
          arrayBuffer: async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
        },
        error: null,
      };
    },
  };

  return {
    files,
    uploads,
    refusedUploads,
    downloads,
    failNextUpload: (message: string) => {
      uploadFailure = message;
    },
    storage: {
      from: (name: string) => {
        if (name !== invoiceDocumentBucket) throw new Error(`Unexpected bucket ${name}`);
        return bucket;
      },
    },
  };
}

/**
 * The two finalization functions, as they behave in Postgres.
 *
 * A small stand-in for `begin_invoice_finalization` and
 * `complete_invoice_finalization`, written against the in-memory tables of
 * `createFakeDb`, so a test can follow the real two-step flow -- number,
 * render, store, record -- without a database. It mirrors the SQL that
 * matters: the number is taken once, the payment reference follows it unless
 * it was typed by hand, and the artifact and `issued_at` are written
 * together.
 */
export function createFinalizationRpc(rows: () => Record<string, unknown>[], nextNumber: () => string) {
  return async (name: string, args: Record<string, unknown> = {}) => {
    const invoice = rows().find((row) => row.id === args.p_invoice_id);
    if (!invoice) return { data: null, error: { message: "Onbekende factuur." } };

    if (name === "begin_invoice_finalization") {
      if (!invoice.finalizing_at) {
        const number = nextNumber();
        const reference = String(invoice.payment_reference ?? "").trim();
        invoice.number_value = number;
        invoice.number_provisional = false;
        invoice.finalizing_at = "2026-09-20T09:00:00.000Z";
        invoice.payment_reference = !reference || /^(FAC|OFF)-CONCEPT-/.test(reference) ? number : reference;
        invoice.activation_note = args.p_activation ?? null;
      }
      return { data: invoice.number_value, error: null };
    }

    if (name === "complete_invoice_finalization") {
      /* The artifact is written once; a later caller is handed the first one. */
      if (invoice.issued_at) {
        if (
          invoice.document_path !== args.p_path ||
          invoice.document_sha256 !== args.p_sha256 ||
          invoice.document_bytes !== args.p_bytes
        ) {
          return {
            data: null,
            error: { message: `Factuur ${invoice.number_value} heeft al een definitieve PDF; een afwijkend document wordt niet vastgelegd.` },
          };
        }
      } else {
        invoice.issued_at = "2026-09-20T09:00:01.000Z";
        invoice.document_path = args.p_path;
        invoice.document_sha256 = args.p_sha256;
        invoice.document_bytes = args.p_bytes;
        invoice.document_generated_at = "2026-09-20T09:00:01.000Z";
        if (invoice.status === "draft") invoice.status = "issued";
      }
      return {
        data: {
          number: invoice.number_value,
          path: invoice.document_path,
          sha256: invoice.document_sha256,
          bytes: invoice.document_bytes,
          adopted: true,
        },
        error: null,
      };
    }

    return { data: null, error: null };
  };
}
