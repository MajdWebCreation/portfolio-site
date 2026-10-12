"use client";

import { useEffect } from "react";
import { portalSignOutAction } from "@/lib/portal/auth-actions";
import { portalLoginPath, portalRoot } from "@/lib/portal/paths";

/**
 * The fallback when the portal's frame itself could not be built -- the
 * check of who is signed in failed on a passing error. Without the shell,
 * so with its own margins; links that start over rather than a navigation.
 */
export default function PortalRootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="label-mono">Klantportaal YM Creations</p>
      <h1 className="display-md mt-4">Het klantportaal kon nu niet worden geladen</h1>
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
        <a href={portalRoot} className="link-static text-ink">
          Naar het overzicht
        </a>
        <a href={portalLoginPath} className="link-static text-ink">
          Naar inloggen
        </a>
        {/* A way out that needs nothing from the database: signing out clears the session and the customer choice. */}
        <form action={portalSignOutAction}>
          <button type="submit" className="link-static text-ink">
            Uitloggen
          </button>
        </form>
      </div>
    </main>
  );
}
