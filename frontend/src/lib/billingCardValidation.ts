/** Client-side card checks for demo / UX (production uses Stripe Elements). */

export type CardValidationResult = { ok: true } | { ok: false; message: string };

const NON_DIGIT = /\D/g;

export function digitsOnly(s: string): string {
  return s.replace(NON_DIGIT, "");
}

export function luhnValid(pan: string): boolean {
  const d = digitsOnly(pan);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function parseExpiry(exp: string): { month: number; year: number } | null {
  const t = exp.trim();
  const m = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const month = parseInt(m[1]!, 10);
  let year = parseInt(m[2]!, 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  const now = new Date();
  const expEnd = new Date(year, month, 1);
  if (expEnd < new Date(now.getFullYear(), now.getMonth(), 1)) return null;
  return { month, year };
}

export function validateCvc(cvc: string, brandGuess: "amex" | "other"): CardValidationResult {
  const d = digitsOnly(cvc);
  if (brandGuess === "amex") {
    if (d.length !== 4) return { ok: false, message: "American Express CVC is 4 digits." };
  } else if (d.length < 3 || d.length > 4) return { ok: false, message: "CVC must be 3 or 4 digits." };
  return { ok: true };
}

export function guessBrandFromPan(pan: string): string {
  const d = digitsOnly(pan);
  if (d.startsWith("34") || d.startsWith("37")) return "Amex";
  if (d.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(d) || /^2(2[2-9]\d|[3-6]\d{2})/.test(d)) return "Mastercard";
  return "Card";
}

export function validateCardForm(input: {
  name: string;
  number: string;
  expiry: string;
  cvc: string;
}): CardValidationResult {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, message: "Enter the name on the card." };

  const pan = digitsOnly(input.number);
  if (pan.length < 13) return { ok: false, message: "Card number looks too short." };
  if (!luhnValid(pan)) return { ok: false, message: "Card number is not valid (checksum)." };

  const exp = parseExpiry(input.expiry);
  if (!exp) return { ok: false, message: "Use expiry MM / YY or MM / YYYY." };

  const brand = guessBrandFromPan(pan);
  const cvcCheck = validateCvc(input.cvc, brand === "Amex" ? "amex" : "other");
  if (!cvcCheck.ok) return cvcCheck;

  return { ok: true };
}
