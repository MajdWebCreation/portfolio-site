import Link from "next/link";
import { portalRoot } from "@/lib/portal/paths";

/**
 * What a member sees for a document that is not theirs to see -- another
 * customer's, a concept, or one that does not exist. One page for all of
 * them, so the answer says nothing about which it was.
 */
export default function PortalNotFound() {
  return (
    <div>
      <p className="label-mono">Niet gevonden</p>
      <h1 className="display-md mt-4">Dit document is hier niet te vinden</h1>
      <p className="mt-4 max-w-prose text-body">
        Het bestaat niet, of het hoort niet bij het bedrijf waarvoor u nu in het portaal bent. Werkt u voor meerdere bedrijven?
        Kies dan bovenaan het juiste bedrijf.
      </p>
      <p className="mt-6">
        <Link href={portalRoot} className="link-static text-ink">
          Naar het overzicht
        </Link>
      </p>
    </div>
  );
}
