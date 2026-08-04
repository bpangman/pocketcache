// src/lib/stripeKey.js
//
// The ONE place the Stripe publishable key lives.
//
// This is the PUBLISHABLE key (pk_test_...). Stripe designs it to be public -
// it can only tokenize cards, never read or charge anything - so committing it
// is safe and deliberate. The secret key (sk_...) lives ONLY in Supabase edge
// function secrets and must never appear in this repo.
//
// WHY A COMMITTED CONSTANT AND NOT AN ENV VAR
// The GitHub Pages deploy workflow runs `npm run build` with no env at all,
// so a VITE_STRIPE_PUBLISHABLE_KEY-only setup shipped the placeholder to
// production and every card save silently fell back to simulated mode. A
// constant makes the deployed build and local dev use the same, real key.
// An env var can still override it locally (e.g. to point at another test
// account) but the constant is the default everywhere.
//
// This is the TEST key. Swapping to the live key is gated behind the
// PRELAUNCH.md launch checklist - do not change it before that clears.

const FALLBACK_PK = 'pk_test_51TIYeERwDaKOJQn2wCAEvRkyqNlSfCnIHZsizRSEZMmQk9p7LIANijjYmd0WyP3ry4D1CYm8yoYSQbDnGyH1QelC00jr6U7sgv';

export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? FALLBACK_PK;
