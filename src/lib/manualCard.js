/**
 * Manual card-entry logic, shared by the three "type your card number" forms:
 *   src/pages/Onboarding.jsx      ConnectCardScreen  (was: formatCardNum)
 *   src/pages/Settings.jsx        TrackCardSheet     (was: formatManualCardNumber)
 *   src/pages/WebPortalPages.jsx  TrackCardModal     (was: webFormatCardNumber)
 * All three formatters were byte-identical:
 *   const digits = raw.replace(/\D/g, '').slice(0, 16);
 *   return digits.replace(/(.{4})/g, '$1 ').trim();
 * formatCardNumber below is that code verbatim, so behaviour is unchanged.
 *
 * ============================================================================
 * DEMO-GRADE VALIDATION ONLY - READ THIS BEFORE REUSING ANY OF IT
 * ============================================================================
 * isValidCardNumber() checks ONE thing: that at least 13 digits were typed.
 *
 *   - There is NO Luhn / mod-10 check. "1111111111111" passes.
 *   - There is NO brand detection, no BIN check, no length-per-brand rule
 *     (Amex is 15, Visa/Mastercard 16, some Maestro 19 - none of that is here).
 *   - There is NO expiry, NO CVC, NO postal code, NO AVS.
 *   - Nothing is verified against an issuer. Nothing is charged.
 *
 * The forms exist so the prototype can show a plausible "card connected" state.
 * They are theatre.
 *
 * A REAL implementation must never let a raw PAN (the full card number) touch
 * this codebase at all. PocketCache is not, and must not become, an entity that
 * handles cardholder data - that drags PCI DSS scope onto the app, the build
 * pipeline and every log sink downstream. Production flow:
 *
 *   - Card / bank linking goes through Plaid Link. The user authenticates with
 *     their institution inside Plaid's own UI; we receive a public_token, swap
 *     it server-side for an access_token, and only ever see the last 4, the
 *     brand and an opaque account id.
 *   - If a card ever has to be entered by hand (it should not for round-ups),
 *     it goes through Stripe Elements / Payment Element, which posts the PAN
 *     straight to Stripe from an iframe we do not control. We get a token.
 *   - Either way: no PAN in React state, no PAN in a form field we own, no PAN
 *     in localStorage, no PAN in an analytics payload or an error report.
 *
 * See PRELAUNCH.md. Deleting these helpers is a good day.
 * ============================================================================
 */

/** Shortest card number any real network issues. Demo floor, see header. */
export const MIN_CARD_DIGITS = 13;

/** Longest card number we let the user type (Visa/Mastercard length). */
export const MAX_CARD_DIGITS = 16;

/**
 * Digits-only, capped at 16, grouped in 4s separated by single spaces.
 * Verbatim behaviour of the three formatters it replaces:
 *   ''                     -> ''
 *   '4'                    -> '4'
 *   '4242'                 -> '4242'
 *   '42424242'             -> '4242 4242'
 *   '4242424242424242'     -> '4242 4242 4242 4242'
 *   '42424242424242429999' -> '4242 4242 4242 4242'   (extra digits dropped)
 *   '4a2b4c2'              -> '4242'                  (non-digits stripped)
 *   '  4242  4242  '       -> '4242 4242'
 */
export function formatCardNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, MAX_CARD_DIGITS);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Strip a formatted value back to bare digits. */
export function cardDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Demo validity: enough digits to look like a card. NOT a real check - see the
 * header comment. Matches the `digits.length < 13` guard in all three forms.
 */
export function isValidCardNumber(value) {
  return cardDigits(value).length >= MIN_CARD_DIGITS;
}

/**
 * Last four digits, for the "···· 4242" display. Returns fewer than 4
 * characters if fewer were typed, and '' for empty input.
 */
export function last4(value) {
  return cardDigits(value).slice(-4);
}

/**
 * Expiry input formatter: digits only, auto-inserts the slash after the month.
 *   '1'    -> '1'
 *   '12'   -> '12/'? no - only once a year digit follows: '12' stays '12'
 *   '123'  -> '12/3'
 *   '1226' -> '12/26'
 * Format-only, like formatCardNumber - validity is isValidExpiry's job.
 */
export function formatExpiry(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/**
 * Demo-grade expiry check, same spirit as isValidCardNumber (see the header):
 * MM between 01 and 12, two-digit year, and not already in the past. Nothing
 * is verified against an issuer.
 */
export function isValidExpiry(value, now = new Date()) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 4) return false;
  const month = parseInt(digits.slice(0, 2), 10);
  const year = 2000 + parseInt(digits.slice(2), 10);
  if (month < 1 || month > 12) return false;
  const thisMonth = now.getFullYear() * 12 + now.getMonth(); // 0-based month index
  const expMonth = year * 12 + (month - 1);
  return expMonth >= thisMonth;
}

/**
 * Demo-grade CVV check: 3 or 4 digits typed. Never sent anywhere, never
 * stored - see the header.
 */
export function isValidCvv(value) {
  return /^\d{3,4}$/.test(String(value ?? '').trim());
}
