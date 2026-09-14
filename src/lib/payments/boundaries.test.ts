import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Server/client boundaries, checked against the source rather than trusted.
 *
 * The secret key and the elevated client exist so that two routes without a
 * session can do their work. Anything that pulls them towards the browser --
 * a "use client" file importing them, a NEXT_PUBLIC_ name, a second module
 * reading the variable -- is a leak, and these tests fail on it.
 */
const root = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // Tests mention these names by design; only shipped source is scanned.
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(root).map((path) => ({ path, source: readFileSync(path, "utf8") }));
const clientFiles = files.filter(({ source }) => /^\s*["']use client["']/.test(source));

describe("the elevated Supabase client", () => {
  it("is read from exactly one module", () => {
    const readers = files.filter(({ source }) => source.includes("process.env.SUPABASE_SECRET_KEY"));
    expect(readers.map(({ path }) => path.replace(root, "src"))).toEqual(["src/lib/payments/admin-client.ts"]);
  });

  it("is never exposed under a NEXT_PUBLIC name", () => {
    const exposed = files.filter(({ source }) => /NEXT_PUBLIC_[A-Z_]*SECRET|NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(source));
    expect(exposed.map(({ path }) => path)).toEqual([]);
  });

  it("is not imported by any client component", () => {
    const offenders = clientFiles.filter(({ source }) => source.includes("payments/admin-client"));
    expect(offenders.map(({ path }) => path.replace(root, "src"))).toEqual([]);
  });

  /* The cookie-reading helper can adopt a visitor's session; these must stay apart. */
  it("does not go through the session-aware server helper", () => {
    const adminClient = files.find(({ path }) => path.endsWith("payments/admin-client.ts"))!;
    expect(adminClient.source).not.toContain("@/lib/supabase/server");
    expect(adminClient.source).not.toContain("next/headers");
    expect(adminClient.source).toContain("persistSession: false");
  });
});

describe("the Mollie key", () => {
  it("is read only by the Mollie configuration module", () => {
    const readers = files.filter(({ source }) => source.includes("process.env.MOLLIE_API_KEY"));
    expect(readers.map(({ path }) => path.replace(root, "src"))).toEqual(["src/lib/mollie/config.ts"]);
  });

  /*
    The payments page reads the mode on the server and passes the word down,
    so a client component may name the type but never the module that reads
    the key.
  */
  it("is not reachable from a client component", () => {
    const offenders = clientFiles.filter(({ source }) => source.includes("lib/mollie/client"));
    expect(offenders.map(({ path }) => path.replace(root, "src"))).toEqual([]);
  });

  it("is only ever type-imported by a client component, never called", () => {
    const offenders = clientFiles
      .filter(({ source }) => source.includes("lib/mollie/config"))
      .filter(({ source }) => !/import type \{[^}]*\} from "@\/lib\/mollie\/config"/.test(source));
    expect(offenders.map(({ path }) => path.replace(root, "src"))).toEqual([]);
  });

  /* Every provider request goes through the one client module. */
  it("is used through a single request module", () => {
    const callers = files.filter(({ source }) => source.includes("https://api.mollie.com"));
    expect(callers.map(({ path }) => path.replace(root, "src"))).toEqual(["src/lib/mollie/client.ts"]);
  });
});

describe("payment tables", () => {
  it("are never written by a client component", () => {
    const offenders = clientFiles.filter(
      ({ source }) => source.includes("payments/webhook-store") || source.includes("payments/prenotification-store"),
    );
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("the pre-notification job", () => {
  it("keeps its cron secret on the server", () => {
    const readers = files.filter(({ source }) => source.includes("process.env.CRON_SECRET"));
    expect(readers.map(({ path }) => path.replace(root, "src"))).toEqual([
      "src/app/api/cron/debit-prenotifications/route.ts",
    ]);
  });

  it("is never reachable from a client component", () => {
    const offenders = clientFiles.filter(
      ({ source }) =>
        source.includes("payments/prenotification-runner") || source.includes("payments/prenotification-store"),
    );
    expect(offenders.map(({ path }) => path.replace(root, "src"))).toEqual([]);
  });

  /*
    The Resend key travels no further than the modules that send. Customer
    mail -- the invoice, the monthly term, the activation link -- has one
    provider module between it and Resend, so there are two places in the
    whole application where the key is read: that module, and the contact
    form, which answers a visitor who has no customer record to file under.
  */
  it("reads the mail key only where mail is sent", () => {
    const readers = files
      .filter(({ source }) => source.includes("process.env.RESEND_API_KEY"))
      .map(({ path }) => path.replace(root, "src"))
      .sort();
    expect(readers).toEqual([
      "src/app/api/contact/route.ts",
      "src/lib/admin/communications/provider.ts",
    ]);
  });
});
