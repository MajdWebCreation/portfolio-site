import type { ReactNode } from "react";
import BrandMark from "@/components/brand-mark";
import { portalLoginPath } from "@/lib/portal/paths";

/**
 * The frame of the pages a customer sees before they are in: signing in,
 * asking for a reset, setting a password, being told there is no access. A
 * quiet sheet with the mark above and the company name below, the way the
 * mails are built; the form sits in a narrow column that reads well on a
 * phone.
 */
export default function PortalFrame({ label, title, intro, children }: { label?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="container-x flex min-h-dvh flex-col justify-between py-8">
      {/* Stays inside the portal: a page that carries a token in its URL links nowhere that could be told about it. */}
      <BrandMark href={portalLoginPath} className="h-8 w-[112px]" label="YM Creations" />

      <div className="w-full max-w-sm py-16">
        <p className="label-mono">{label ?? "Klantportaal"}</p>
        <h1 className="display-md mt-4">{title}</h1>
        {intro ? <p className="mt-3 text-muted">{intro}</p> : null}
        {children}
      </div>

      <p className="label-mono">YM Creations</p>
    </main>
  );
}
