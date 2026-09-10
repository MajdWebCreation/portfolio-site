import AdminMobileNav from "@/components/admin/admin-mobile-nav";
import AdminSidebar from "@/components/admin/admin-sidebar";
import type { AdminIdentity } from "@/lib/admin/auth";

/**
 * Frame of every admin page: sidebar on the left from lg up, a top bar with a
 * menu below that, and the page content in a bounded column.
 */
export default function AdminShell({ admin, children }: { admin: AdminIdentity; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-body lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <AdminSidebar admin={admin} />
      <div className="flex min-w-0 flex-col">
        <AdminMobileNav admin={admin} />
        <main id="main" className="w-full max-w-[72rem] flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
