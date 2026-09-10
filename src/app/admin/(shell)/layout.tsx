import AdminShell from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/admin/access";

/**
 * Frame for every admin page. Without an admin session the request never gets
 * here; each page repeats the check, see lib/admin/access.ts.
 */
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return <AdminShell admin={admin}>{children}</AdminShell>;
}
