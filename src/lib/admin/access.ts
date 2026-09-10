import { redirect } from "next/navigation";
import { getAdminAccess, type AdminIdentity } from "@/lib/admin/auth";
import { adminLoginPath } from "@/lib/admin/modules";

/**
 * Admin access, database phase 1.
 *
 * The development-only guard is gone. Access is now decided by a real
 * Supabase session plus an active row in `admin_profiles`; see
 * `lib/admin/auth.ts` for why those are two separate questions.
 *
 * Call `requireAdminAccess()` in the admin layout AND in every admin page,
 * server action and data loader. Layouts and pages render in parallel, so a
 * check in the layout alone would still let a page's payload be rendered.
 * The repositories check as well, so no admin data can be read without a
 * decision having been made, whatever calls them later.
 *
 * The check is cached per request, so repeating it costs nothing.
 */

/** Returns the signed-in admin, or leaves the render for the login page. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const access = await getAdminAccess();

  if (access.state === "admin") {
    return access.admin;
  }

  // Signed in without admin rights ends up on the same page as not being
  // signed in at all. That page reads the state itself and explains the
  // situation; neither case reveals anything about the admin.
  redirect(adminLoginPath);
}

/** For call sites that only need the guard, not the identity. */
export async function requireAdminAccess(): Promise<void> {
  await requireAdmin();
}
