import Link from "next/link";
import AdminNavList from "@/components/admin/admin-nav-list";
import SignOutButton from "@/components/admin/sign-out-button";
import BrandMark from "@/components/brand-mark";
import type { AdminIdentity } from "@/lib/admin/auth";
import { adminRoot } from "@/lib/admin/modules";

/**
 * Desktop navigation: a sticky column with the brand, the module list and who
 * is signed in. Hidden below lg, where AdminMobileNav takes over.
 */
export default function AdminSidebar({ admin }: { admin: AdminIdentity }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <BrandMark href={adminRoot} className="h-7 w-[98px]" label="YM Creations admin" />
        <span className="label-mono mt-0.5 text-faint">Admin</span>
      </div>

      <nav aria-label="Adminnavigatie" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <AdminNavList />
      </nav>

      <div className="border-t border-line px-5 py-4 text-[0.85rem]">
        <p className="label-mono">Ingelogd</p>
        <p className="mt-1 truncate text-muted" title={admin.email ?? undefined}>
          {admin.displayName ?? admin.email ?? "Beheerder"}
        </p>
        <div className="mt-2 flex items-center gap-4">
          <Link href="/nl" className="link-static text-ink">
            Website
          </Link>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
