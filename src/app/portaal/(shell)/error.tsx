"use client";

import Link from "next/link";
import { useEffect } from "react";
import { portalRoot } from "@/lib/portal/paths";

/**
 * A page of the portal failed to load -- a passing database or network error,
 * most likely. The navigation stays; the member gets a plain sentence, a
 * retry and a way to reach us, never the framework's own message. What went
 * wrong is logged on the server; the digest only ties this view to that log.
 */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal page failed", { digest: error.digest });
  }, [error]);

  return (
    <div>
      <p className="label-mono">Er ging iets mis</p>
      <h1 className="display-md mt-4">Deze pagina kon nu niet worden geladen</h1>
      <p className="mt-4 max-w-prose text-body">
        Dat ligt niet aan u. Probeer het zo opnieuw. Blijft het misgaan, mail dan naar{" "}
        <a href="mailto:contact@ymcreations.com" className="link-static text-ink">
          contact@ymcreations.com
        </a>
        .
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper"
        >
          Opnieuw proberen
        </button>
        <Link href={portalRoot} className="link-static text-ink">
          Naar het overzicht
        </Link>
      </div>
    </div>
  );
}
