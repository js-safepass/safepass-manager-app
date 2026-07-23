// Maps the backend's RFC-7807 `code` (auth-contract §2) to the ONE frontend
// action it should drive. Branch on `code`, never on the free-text `detail`
// (casing is inconsistent server-side — match exact-per-code).
//
// MFA is enforced by Cognito at the pool level (MfaConfiguration=REQUIRED,
// 2026-07-17) — enrollment and the login challenge happen in the hosted login,
// so a valid token IS proof of MFA and the backend no longer emits any
// MFA_* code. This map only handles the codes that survive that model.
//
// Pure and unit-tested; state/AuthContext.jsx is the only wiring.

export const AUTH_ACTION = {
  // Sign out + re-login, then resume where the user was. Reached when the
  // session was revoked server-side (password change / deactivation trigger a
  // Cognito global sign-out) or a bearer/config fault (ID_TOKEN_REQUIRED).
  REAUTH: 'reauth',
  // Account deactivated/archived — terminal, no re-entry.
  TERMINAL: 'terminal',
  // Plain expiry / unknown 401 — the seam's silent refresh-then-retry handles
  // the common case; a persistent one is threshold-gated into a local sign-out.
  EXPIRY: 'expiry',
};

export function resolveAuthAction(code) {
  switch (code) {
    // We already send the ID token (auth-contract §1). If this still fires it's
    // a bearer/audience config fault a retry can't fix — a clean re-login is the
    // safest response, and the warning at the call site makes it diagnosable.
    case 'ID_TOKEN_REQUIRED':
      return AUTH_ACTION.REAUTH;
    case 'USER_ACCOUNT_INACTIVE':
      return AUTH_ACTION.TERMINAL;
    default:
      return AUTH_ACTION.EXPIRY;
  }
}
