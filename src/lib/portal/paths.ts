/**
 * Where the customer portal lives. One file, so a route is named once and the
 * proxy, the guards and the mails agree on it.
 *
 * Same domain as the site and the admin, under /portaal. The admin is at
 * /admin; the two share Supabase's cookies and nothing else: neither one's
 * authorization grants anything on the other.
 */
export const portalRoot = "/portaal";
export const portalLoginPath = "/portaal/inloggen";
export const portalForgotPasswordPath = "/portaal/wachtwoord-vergeten";
export const portalSetPasswordPath = "/portaal/wachtwoord-instellen";
export const portalChangePasswordPath = "/portaal/wachtwoord-wijzigen";
export const portalNoAccessPath = "/portaal/geen-toegang";
export const portalAccountPath = "/portaal/account";
export const portalInvoicesPath = "/portaal/facturen";
export const portalQuotesPath = "/portaal/offertes";
export const portalServicesPath = "/portaal/diensten";
export const portalDetailsPath = "/portaal/gegevens";

export function portalInvoicePath(id: string): string {
  return `${portalInvoicesPath}/${id}`;
}

export function portalQuotePath(id: string): string {
  return `${portalQuotesPath}/${id}`;
}

/**
 * Routes a visitor may reach without a session: signing in, asking for a
 * reset, and the page a mailed link lands on. Everything else under /portaal
 * needs a session (proxy) and a membership (the shell layout).
 */
export const portalPublicPaths: readonly string[] = [portalLoginPath, portalForgotPasswordPath, portalSetPasswordPath];

export function isPortalPath(pathname: string): boolean {
  return pathname === portalRoot || pathname.startsWith(`${portalRoot}/`);
}

export function isPortalPublicPath(pathname: string): boolean {
  return portalPublicPaths.includes(pathname);
}
