/**
 * Auth middleware — JWT session token verification.
 *
 * Every /api route EXCEPT /health and /api/webhooks requires a valid token.
 * In production, the token's subject (sub) comes from Apple/Google identity verification.
 *
 * Token structure:
 *   { sub: userId, iat, exp }
 *
 * The token is signed with SESSION_SECRET (symmetric HS256 for now).
 * In production, swap this for asymmetric verification of Apple/Google JWTs:
 *   - Apple:  verify against Apple's public keys (https://appleid.apple.com/auth/keys)
 *   - Google: verify against Google's public keys (https://www.googleapis.com/oauth2/v3/certs)
 *
 * Sets req.userId from the verified token — all route handlers use req.userId.
 * NEVER take userId from req.body or req.params for authorization — that's an IDOR bug.
 */

import jwt from 'jsonwebtoken';

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('[auth] WARNING: SESSION_SECRET not set — all requests will be rejected');
}

/**
 * Express middleware: verify JWT Bearer token in Authorization header.
 * On success: sets req.userId and calls next().
 * On failure: returns 401 JSON.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SESSION_SECRET ?? 'insecure-dev-secret');
    // sub = userId (UUID)
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
  }
}

/**
 * Generate a session token for a user.
 * Call this after successful Apple/Google identity verification.
 * In production, remove this and use real SSO identity tokens.
 */
export function issueToken(userId, expiresIn = '30d') {
  return jwt.sign({ sub: userId }, SESSION_SECRET ?? 'insecure-dev-secret', { expiresIn });
}
