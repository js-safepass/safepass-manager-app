// Persisted-session payload rules (Tier 1, docs/session-persistence-plan.md).
//
// ONLY the refresh token is ever persisted — ID/access tokens are re-minted
// through the refresh grant on every restore, and the 5-day refresh-token
// expiry on the Cognito app client is the server-enforced backstop (no client
// TTL here on purpose: the server is the authority; an expired token fails the
// grant with invalid_grant, which the caller classifies as DEFINITIVE and
// wipes).
//
// Pure and unit-tested; state/AuthContext.jsx (via lib/native/secureStorage)
// is the only wiring. The stored value is versioned so a future shape change
// (e.g. Tier 2 metadata) can migrate-or-wipe explicitly.

export const SESSION_STORAGE_KEY = 'manager.session.v1';

const VERSION = 1;

// Serialize the session for secure storage. Returns null when there is
// nothing worth persisting (no refresh token — e.g. a dev sign-in).
export function packStoredSession(refreshToken, nowMs) {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;
  return JSON.stringify({ v: VERSION, refreshToken, storedAt: nowMs });
}

// Parse + validate a stored payload. Null for anything malformed, empty, or
// from an unknown version — callers treat null as "nothing stored" and wipe,
// so corrupt data degrades to a normal login, never a crash.
export function unpackStoredSession(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.v !== VERSION) return null;
  if (typeof parsed.refreshToken !== 'string' || parsed.refreshToken.length === 0) return null;
  return { refreshToken: parsed.refreshToken, storedAt: parsed.storedAt ?? null };
}
