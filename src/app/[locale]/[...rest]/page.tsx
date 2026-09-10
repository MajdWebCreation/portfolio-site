import { notFound } from "next/navigation";

/**
 * Catch-all for unmatched paths inside a locale, so the branded not-found
 * page of the locale segment is rendered instead of the framework default.
 */
export default function CatchAllPage() {
  notFound();
}
