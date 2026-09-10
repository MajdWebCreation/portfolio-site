/**
 * Money as integer euro cents. All document arithmetic (lines, VAT, totals)
 * runs on integers so results are exact and deterministic; only formatting
 * turns cents into "€ 1.495,00".
 */
export type Cents = number;

export const currency = "EUR";

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} is not a finite number`);
  }
}

/** Round half away from zero to an integer, without float drift. */
export function roundHalfUp(value: number): number {
  assertFinite(value, "value");
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5);
}

/** Euros as a number (e.g. 14.95) to cents; rounds to the nearest cent. */
export function eurosToCents(euros: number): Cents {
  assertFinite(euros, "euros");
  return roundHalfUp(euros * 100);
}

/**
 * Parse Dutch or plain input to cents: "1.495,00", "1495,5", "1495", "€ 12,50",
 * "12.50" (a single dot with 1-2 decimals is read as a decimal point).
 * Returns null for anything that is not an amount.
 */
export function parseCents(input: string): Cents | null {
  let text = input.trim().replace(/^€\s*/, "").replace(/\s/g, "");
  if (text === "") return null;
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);

  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(text) || /^\d+(,\d{1,2})?$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    // plain decimal point
  } else {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** "1.495,00" (no symbol), for inputs. */
export function centsToInput(cents: Cents): string {
  assertFinite(cents, "cents");
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${whole},${fraction}`;
}

/** "€ 1.495,00" in Dutch notation (non-breaking space after the symbol). */
export function formatCents(cents: Cents): string {
  return `€ ${centsToInput(cents)}`;
}

/**
 * Parse a quantity such as "1", "2,5" or "0.25" to hundredths (integer), so
 * quantity × price stays integer arithmetic. Max two decimals.
 */
export function parseQuantityHundredths(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const hundredths = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(hundredths) ? hundredths : null;
}

/** "2,5" or "1" from hundredths. */
export function formatQuantity(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  if (fraction === 0) return String(whole);
  return `${whole},${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}
