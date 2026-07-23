// Minimal JWT decoder for extracting claims we don't need to verify.
// The JWT is already trusted (issued by Cognito to this client via OAuth),
// so we don't re-validate signatures here — only parse the payload for the
// claims we care about (e.g. `sub` for user identity binding).
//
// Returns null on any parse failure rather than throwing, so callers can
// gracefully degrade rather than blowing up on malformed tokens.

function base64UrlDecode(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    if (typeof atob === 'function') {
      const binary = atob(padded);
      let result = '';
      for (let i = 0; i < binary.length; i += 1) {
        result += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
      }
      return decodeURIComponent(result);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Decode a JWT and return its payload claims, or null on any failure.
 * Does NOT verify the signature — assumes the JWT was obtained through a
 * trusted channel (e.g. Cognito OAuth flow).
 *
 * @param {string} token
 * @returns {object|null}
 */
export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const decoded = base64UrlDecode(parts[1]);
  if (decoded === null) return null;
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extract the Cognito user subject identifier from a Cognito JWT.
 * Returns null if the token is malformed or has no `sub` claim.
 *
 * @param {string} token
 * @returns {string|null}
 */
export function getJwtSub(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
}

/**
 * Milliseconds-epoch expiry of a JWT, or null when the token is malformed
 * or carries no `exp` claim.
 *
 * @param {string} token
 * @returns {number|null}
 */
export function getJwtExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
}

/**
 * Whether a token is still comfortably inside its lifetime. Tokens without
 * a readable `exp` claim (dev placeholders, opaque strings) are treated as
 * fresh — expiry enforcement for those belongs to the server.
 *
 * @param {string} token
 * @param {{ skewMs?: number, now?: number }} [options] — skewMs (default
 *   30s) refreshes slightly early so an in-flight request can't straddle
 *   the expiry.
 * @returns {boolean}
 */
export function isJwtFresh(token, { skewMs = 30_000, now = Date.now() } = {}) {
  const expiry = getJwtExpiryMs(token);
  if (expiry === null) return true;
  return expiry - skewMs > now;
}
