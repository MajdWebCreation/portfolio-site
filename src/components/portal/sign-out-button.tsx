import { portalSignOutAction } from "@/lib/portal/auth-actions";

/** A form post, not a link: it changes state on the server and works without JavaScript. */
export default function PortalSignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={portalSignOutAction}>
      <button type="submit" className={`link-static text-ink ${className}`}>
        Uitloggen
      </button>
    </form>
  );
}
