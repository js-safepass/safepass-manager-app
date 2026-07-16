// Maps the backend's RFC-7807 `code` (auth-contract §2) to the ONE frontend
// action it should drive. Branch on `code`, never on the free-text `detail`
// (casing is inconsistent server-side — match exact-per-code).
//
// This app is the "core hardening only" case: it has NO MFA enrollment UI (that
// lives in the admin app). So the MFA codes route to a "complete MFA in the
// admin app" notice rather than an in-app enroll flow.
//
// Pure and unit-tested; state/AuthContext.jsx is the only wiring.

export const AUTH_ACTION = {
  // Sign out + re-login, then resume where the user was. The session predates
  // enrollment (MFA_REAUTH_REQUIRED) or was revoked server-side (password
  // change / deactivation trigger a Cognito global sign-out).
  REAUTH: 'reauth',
  // Org requires MFA and the user has no enabled factor. No enroll UI here —
  // direct them to the admin app.
  MFA_ENROLL: 'mfa_enroll',
  // Privileged role has a factor but not TOTP — direct them to the admin app's
  // authenticator (security) settings.
  MFA_TOTP: 'mfa_totp',
  // Account deactivated/archived — terminal, no re-entry.
  TERMINAL: 'terminal',
  // Plain expiry / unknown 401 — the seam's silent refresh-then-retry handles
  // the common case; a persistent one is threshold-gated into a local sign-out.
  EXPIRY: 'expiry',
};

export function resolveAuthAction(code) {
  switch (code) {
    case 'MFA_REAUTH_REQUIRED':
      return AUTH_ACTION.REAUTH;
    // We already send the ID token (auth-contract §1). If this still fires it's
    // a bearer/audience config fault a retry can't fix — a clean re-login is the
    // safest response, and the warning at the call site makes it diagnosable.
    case 'ID_TOKEN_REQUIRED':
      return AUTH_ACTION.REAUTH;
    case 'MFA_REQUIRED':
      return AUTH_ACTION.MFA_ENROLL;
    case 'MFA_TOTP_REQUIRED':
      return AUTH_ACTION.MFA_TOTP;
    case 'USER_ACCOUNT_INACTIVE':
      return AUTH_ACTION.TERMINAL;
    default:
      return AUTH_ACTION.EXPIRY;
  }
}

// The two codes that leave the user authenticated-but-gated (needs remediation
// elsewhere) rather than signed out — these drive the MFA notice overlay.
export function isMfaAction(action) {
  return action === AUTH_ACTION.MFA_ENROLL || action === AUTH_ACTION.MFA_TOTP;
}
