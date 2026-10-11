/**
 * Our own rule for a new portal password. The Auth server applies its own
 * minimum as well; this one is the floor the forms show and the actions
 * check. A plain module, so client components and server actions can both
 * read it.
 */
export const minimumPasswordLength = 10;

export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < minimumPasswordLength) return `Kies een wachtwoord van minimaal ${minimumPasswordLength} tekens.`;
  if (password !== confirmation) return "De twee wachtwoorden zijn niet gelijk.";
  return null;
}
