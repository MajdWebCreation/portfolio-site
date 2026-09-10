import { signOutAction } from "@/lib/admin/auth-actions";

/**
 * Signing out is a form post, not a link: it changes state on the server, and
 * it keeps working without JavaScript.
 */
export default function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={`link-static text-ink ${className}`}>
        Uitloggen
      </button>
    </form>
  );
}
