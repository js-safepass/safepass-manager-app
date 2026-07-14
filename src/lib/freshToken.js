// Fresh-access-token provider: the decision-shaped half of token refresh,
// framework-free so it's exhaustively testable (chassis D11). AuthContext
// owns the React wiring; this owns the rules:
//
//   - a fresh access token passes straight through (no network)
//   - a stale one triggers the refresh-token grant — concurrent callers
//     share ONE in-flight refresh (dedupe), so a burst of API calls at
//     expiry can't stampede the token endpoint
//   - sequential refreshes are throttled (minRefreshIntervalMs): a device
//     whose clock runs fast reads even a just-minted token as stale, so
//     without a floor every poll would fire a fresh grant. `forceRefresh`
//     (the 401-retry path) bypasses the throttle.
//   - Cognito doesn't rotate refresh tokens by default: keep the existing
//     one unless the response carries a replacement
//   - a refresh that resolves after the session changed (sign-out, or a new
//     sign-in) must NOT write its result back — the race guard drops it
//   - refresh failure is NON-TERMINAL: return the best token still held (the
//     refresh may have fired early on skew, so the current token can still be
//     valid) and let the server 401 + AuthContext's threshold gate decide
//     whether to sign out. Mirrors sentinel-ui's authToken.js, which never
//     signs out on a refresh failure.
//
// Sign-out does NOT live here (unlike the earlier draft's onRefreshFailed
// hook): a single failed refresh is not a terminal event, so the sign-out
// decision belongs to the 401 path where it can be threshold-gated.

import { isJwtFresh } from './jwtUtil.js';

const DEFAULT_MIN_REFRESH_INTERVAL_MS = 10_000;

export function createFreshTokenProvider({
  getTokens,             // () => { accessToken, refreshToken }
  setTokens,             // ({ accessToken, refreshToken }) => void
  refresh,               // ({ refreshToken }) => Promise<tokenEndpointPayload>
  onRefreshError,        // (error) => void — LOGGING ONLY (refresh failure is non-terminal)
  isFresh = isJwtFresh,
  minRefreshIntervalMs = DEFAULT_MIN_REFRESH_INTERVAL_MS,
  now = () => Date.now(),
}) {
  let inflight = null;
  // -Infinity, not 0: "never attempted" must always be outside the throttle
  // window regardless of the clock's origin (real or injected).
  let lastAttemptAt = -Infinity;

  return async function getFreshAccessToken({ forceRefresh = false } = {}) {
    const { accessToken, refreshToken } = getTokens();

    // Fresh access token passes straight through — no network.
    if (!forceRefresh && accessToken && isFresh(accessToken)) return accessToken;
    // Nothing to refresh with: hand back whatever we have; the server 401
    // drives recovery (threshold-gated in AuthContext).
    if (!refreshToken) return accessToken;

    // Concurrent callers share ONE in-flight refresh. The shared promise
    // RESOLVES to the best token (never rejects), so every waiter — not just
    // the one that started the grant — gets the non-terminal fallback.
    if (inflight) return inflight;

    // Throttle sequential refreshes so a skewed clock / burst can't stampede
    // the token endpoint. A forced refresh (the 401-retry) bypasses it.
    if (!forceRefresh && now() - lastAttemptAt < minRefreshIntervalMs) {
      return accessToken;
    }

    lastAttemptAt = now();
    const refreshTokenUsed = refreshToken;
    inflight = (async () => {
      try {
        const payload = await refresh({ refreshToken: refreshTokenUsed });
        const nextAccess = payload?.access_token;
        if (!nextAccess) throw new Error('Token refresh response missing access token.');
        // Race guard: the session may have changed while the grant was in
        // flight. Only commit (and only return the new token) if the refresh
        // token we used is still current — otherwise a slow refresh would
        // resurrect a signed-out session or clobber a newer user's tokens.
        const current = getTokens();
        if (current.refreshToken !== refreshTokenUsed) {
          return current.accessToken ?? null;
        }
        setTokens({
          accessToken: nextAccess,
          refreshToken: payload.refresh_token || refreshTokenUsed,
        });
        return nextAccess;
      } catch (error) {
        onRefreshError?.(error); // logged once (single in-flight closure)
        // NON-TERMINAL: resolve to the best token still held. The server 401
        // + AuthContext's threshold gate own the sign-out decision.
        return getTokens().accessToken ?? null;
      }
    })();

    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}
