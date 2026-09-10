/**
 * The two public Supabase values that the browser and the server both need.
 *
 * Both are publishable by design: they travel to the browser with every page
 * and are useless without a session, because row level security decides what
 * a request may read. Nothing secret is read here — the service role key is
 * not used anywhere in this codebase, and must never be.
 *
 * Written as literal `process.env.X` lookups so Next can inline them into the
 * client bundle at build time.
 */
export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is niet geconfigureerd. Zet NEXT_PUBLIC_SUPABASE_URL en " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, zie .env.example.",
    );
  }

  return { url, publishableKey };
}
