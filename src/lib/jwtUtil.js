// Minimal JWT decoder for extracting claims we don't need to verify.
// The kioskJwt is already trusted (issued by Cognito to this client via OAuth),
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
 * Extract the Cognito user subject identifier from a kioskJwt.
 * Returns null if the token is malformed or has no `sub` claim.
 *
 * @param {string} token
 * @returns {string|null}
 */
export function getJwtSub(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
}
