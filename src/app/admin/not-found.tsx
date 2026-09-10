import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import { getAdminAccess } from "@/lib/admin/auth";
import { adminRoot } from "@/lib/admin/modules";

/** Shown for unknown admin paths. Deliberately bare. */
export default async function AdminNotFound() {
  const access = await getAdminAccess();
  const href = access.state === "admin" ? adminRoot : "/nl";

  return (
    <main className="container-x flex min-h-dvh flex-col justify-between py-8">
      <BrandMark href="/nl" className="h-8 w-[112px]" />
      <div className="max-w-xl py-16">
        <p className="label-mono">404</p>
        <h1 className="display-md mt-4">Deze pagina bestaat niet.</h1>
        <Link href={href} className="link-line mt-6 inline-block font-medium text-ink">
          {href === adminRoot ? "Naar het dashboard" : "Naar de website"}
        </Link>
      </div>
      <p className="label-mono">YM Creations</p>
    </main>
  );
}
