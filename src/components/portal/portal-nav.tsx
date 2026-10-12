"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { portalAccountPath, portalDetailsPath, portalInvoicesPath, portalQuotesPath, portalRoot, portalServicesPath } from "@/lib/portal/paths";

const items = [
  { href: portalRoot, label: "Overzicht" },
  { href: portalInvoicesPath, label: "Facturen" },
  { href: portalQuotesPath, label: "Offertes" },
  { href: portalServicesPath, label: "Diensten" },
  { href: portalDetailsPath, label: "Mijn gegevens" },
  { href: portalAccountPath, label: "Account" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === portalRoot) return pathname === portalRoot;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The portal's sections, in one row. On a phone the row scrolls sideways
 * rather than folding into a menu: six short words, always in sight.
 */
export default function PortalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Portaal" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 text-[0.92rem]">
        {items.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-10 items-center border-b-2 px-2 transition-colors ${
                  current ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
