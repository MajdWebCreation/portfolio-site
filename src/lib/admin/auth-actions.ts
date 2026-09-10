"use server";

import { redirect } from "next/navigation";
import { readActiveAdminProfile } from "@/lib/admin/auth";
import { adminLoginPath, adminRoot } from "@/lib/admin/modules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

/**
 * One message for every failure. A wrong password, an unknown address and an
 * account without admin rights read the same from the outside, so the form
 * cannot be used to find out which addresses exist or which of them are
 * admins. Supabase rate-limits the attempts themselves.
 */
const signInFailed = "Onbekende combinatie van e-mailadres en wachtwoord.";

/**
 * Signing in is a server action, so the session cookies are written by the
 * server and no token is assembled in client JavaScript.
 *
 * A successful password check is not enough. Without an active row in
 * `admin_profiles` the session is ended again immediately, so a signed-in
 * visitor without rights never holds a session for the admin at all.
 */
export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Vul je e-mailadres en wachtwoord in." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: signInFailed };
  }

  const profile = await readActiveAdminProfile(supabase, data.user.id);

  if (!profile) {
    await supabase.auth.signOut();
    return { error: signInFailed };
  }

  redirect(adminRoot);
}

/** Ends the session server-side and clears its cookies. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(adminLoginPath);
}
