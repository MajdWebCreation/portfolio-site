import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import LoginForm from "@/components/admin/login-form";
import SignOutButton from "@/components/admin/sign-out-button";
import { getAdminAccess } from "@/lib/admin/auth";
import { adminRoot } from "@/lib/admin/modules";

export const metadata: Metadata = { title: "Inloggen" };

/**
 * The only admin page reachable without a session. There is no sign-up and no
 * password reset here: accounts are created in Supabase, and admin rights are
 * granted there too.
 */
export default async function AdminLoginPage() {
  const access = await getAdminAccess();

  if (access.state === "admin") {
    redirect(adminRoot);
  }

  // Signed in, but without admin rights. Saying so plainly beats a 404 that
  // sends someone hunting for a broken link, and it reveals nothing: they
  // already know they are signed in. The way out is the sign-out button.
  const deniedEmail = access.state === "denied" ? access.email : null;

  return (
    <main className="container-x flex min-h-dvh flex-col justify-between py-8">
      <BrandMark href="/nl" className="h-8 w-[112px]" label="YM Creations" />

      <div className="w-full max-w-sm py-16">
        <p className="label-mono">Admin</p>
        <h1 className="display-md mt-4">Inloggen</h1>

        {access.state === "denied" ? (
          <div className="mt-6 border-l-2 border-danger pl-4">
            <p className="text-[0.92rem] text-body">
              {deniedEmail ? `Je bent ingelogd als ${deniedEmail}, maar dit` : "Dit"} account heeft geen
              toegang tot de admin.
            </p>
            <SignOutButton className="mt-2 inline-block text-[0.92rem]" />
          </div>
        ) : (
          <p className="mt-3 text-muted">Alleen voor beheerders van YM Creations.</p>
        )}

        {access.state === "anonymous" ? <LoginForm /> : null}
      </div>

      <p className="label-mono">YM Creations</p>
    </main>
  );
}
