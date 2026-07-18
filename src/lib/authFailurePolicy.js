// The forced-sign-out decision for the plain-401 (EXPIRY) path, extracted
// from AuthContext so the rules are exhaustively testable (repo convention:
// decision-shaped code lives in lib/). Under 15-minute ID tokens the silent
// refresh runs ~4×/hour/tab, so refresh-infrastructure blips are ROUTINE —
// this policy signs the user out only on DEFINITIVE session death:
//
//   - a 401 while the app still holds a token that is fresh by its own `exp`
//     never signs out: the backend rejected a VALID token (app-client
//     audience off, policy/authz fault). Signing out can't fix it and would
//     loop; the error surfaces at the call site instead.
//   - a 401 whose most recent renew attempt failed TRANSIENTLY (network,
//     bridge 5xx/gateway page, throttling) NEVER counts toward sign-out —
//     even a burst of concurrent polls all 401-ing during one bridge blip
//     must not end a working front-desk session. (This is the web-UI
//     "2-strike" footgun, deliberately not ported: renew failures don't
//     strike unless renewal is definitively dead.)
//   - countable 401s (renewal DEFINITIVELY failed — OAuth invalid_grant, the
//     refresh token is revoked/expired — or there is no refresh material at
//     all) are threshold-gated inside a sliding window, so a lone straddling-
//     expiry 401 is still tolerated.
//
// state/AuthContext.jsx is the only wiring: it feeds refresh outcomes in via
// noteRefreshFailure/noteRefreshSuccess and asks shouldSignOut() per 401.

import { isJwtFresh } from './jwtUtil.js';
import { isDefinitiveRefreshFailure } from './cognitoHostedUi.js';

// Sign out only after this many countable 401s inside the window — one
// transient 401 (a request straddling expiry) must not end a session.
export const AUTH_FAILURE_THRESHOLD = 2;
export const AUTH_FAILURE_WINDOW_MS = 120_000;

export function createAuthFailurePolicy({
  threshold = AUTH_FAILURE_THRESHOLD,
  windowMs = AUTH_FAILURE_WINDOW_MS,
  isFresh = isJwtFresh,
  isDefinitiveFailure = isDefinitiveRefreshFailure,
  now = () => Date.now(),
} = {}) {
  let strikes = [];
  // Outcome of the most recent refresh attempt: null (none / last succeeded)
  // or { definitive } for a failure. By the time a 401 reaches shouldSignOut
  // with a stale token, the seam's forced refresh has just run, so this
  // reflects the CURRENT renewability of the session.
  let lastRefreshFailure = null;

  return {
    noteRefreshFailure(error) {
      lastRefreshFailure = { definitive: isDefinitiveFailure(error), at: now() };
    },
    // A committed refresh proves the session renews — clear any stale failure
    // record so it can't suppress (or cause) a later decision.
    noteRefreshSuccess() {
      lastRefreshFailure = null;
    },
    reset() {
      strikes = [];
      lastRefreshFailure = null;
    },
    // Called once per auth-relevant 401 that reached the server (never for
    // local/renew failures). Returns true when the session should end.
    shouldSignOut({ idToken } = {}) {
      // Reads the ACTUAL token's exp, never a wall-clock age.
      if (idToken && isFresh(idToken)) return false;
      if (lastRefreshFailure && !lastRefreshFailure.definitive) return false;
      const t = now();
      strikes = strikes.filter((at) => t - at < windowMs);
      strikes.push(t);
      return strikes.length >= threshold;
    },
  };
}
