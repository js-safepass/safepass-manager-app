import { useCallback, useMemo, useRef, useState } from 'react';
import { getUserFacingError } from '../lib/userErrors.js';
import { getJwtSub, isJwtFresh } from '../lib/jwtUtil.js';
import { flattenErrorForLog } from '../lib/errorLog.js';
import { buildLogoutUrl, refreshTokens } from '../lib/cognitoHostedUi.js';
import { createFreshTokenProvider } from '../lib/freshToken.js';
import { AuthContext } from './useAuth.js';

// Auth state for an attended app: Cognito tokens live in memory only (never
// web storage — XSS-exfiltratable; seed bundle DECISIONS D6). A page refresh
// drops them and the user signs in again; that's the accepted trade-off (no
// Layer-2 device session — decision #4 in docs/build-plan.md).
//
// Token lifetime: the access token is short-lived; getFreshAccessToken
// silently runs the refresh-token grant when it goes stale — front-desk
// sessions run all day and must not be interrupted by forced re-logins. The
// refresh rules (dedupe, throttle, rotation, race guard) live in
// lib/freshToken.js where they're unit-tested.
//
// Resilience model ported from sentinel-ui via the mapping app (2026-07-13):
// a refresh FAILURE is non-terminal (freshToken.js resolves to the best token
// it still holds), and the sign-out decision lives ONLY on the 401 path
// below, threshold-gated — a single transient blip or a bridge 5xx never
// force-signs-out a working front desk.
//
// VITE_MODE=dev short-circuits to signed_in with a placeholder token (or
// VITE_DEV_MANAGER_JWT) so local development doesn't need Cognito at all.

// Sign out only after this many 401s inside the window — one transient 401
// (a request straddling expiry, a brief bridge hiccup) must not end a session.
const AUTH_FAILURE_THRESHOLD = 2;
const AUTH_FAILURE_WINDOW_MS = 120_000;

export function AuthProvider({ children }) {
  const isDevMode = import.meta.env.VITE_MODE === 'dev';
  const devToken = import.meta.env.VITE_DEV_MANAGER_JWT || 'dev';

  // Tokens live in a ref, not state: they rotate silently on refresh and
  // nothing should re-render on rotation. `status` drives rendering. The
  // bearer we carry is the Cognito ID token (auth-contract §1); the refresh
  // token stays in memory only (never web storage — XSS-exfiltratable).
  const tokensRef = useRef({
    idToken: isDevMode ? devToken : null,
    refreshToken: null,
  });

  // Cognito subject identifier — an identifier, not a credential; useful for
  // logging/support correlation.
  const [cognitoUserSub, setCognitoUserSub] = useState(() =>
    isDevMode ? getJwtSub(devToken) : null,
  );
  const [status, setStatus] = useState(() => (isDevMode ? 'signed_in' : 'signed_out'));
  const [error, setError] = useState(null);

  const freshTokenRef = useRef(null);
  // Timestamps of recent 401s (see onUnauthorized's threshold gate).
  const authFailuresRef = useRef([]);

  const signOut = useCallback(({ hosted = true } = {}) => {
    const hadToken = Boolean(tokensRef.current.idToken);
    tokensRef.current = { idToken: null, refreshToken: null };
    freshTokenRef.current = null; // drop the provider's in-flight/throttle state
    authFailuresRef.current = [];
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
    // End the Cognito Hosted UI session too, so "sign out" means signed out
    // — but only when the user explicitly asked (hosted=true). API-driven
    // sign-outs skip it: the SSO cookie may still be valid and lets the user
    // back in with one click.
    if (hosted && hadToken && !isDevMode) {
      try {
        window.location.assign(buildLogoutUrl());
      } catch {
        // Missing logout config — local sign-out already happened.
      }
    }
  }, [isDevMode]);

  const signIn = useCallback(async ({ token, refreshToken } = {}) => {
    if (isDevMode && !token) {
      // Restore the dev bearer so the accessor stops returning null after a
      // dev sign-out (the accessor does not fall back to devToken).
      tokensRef.current = { idToken: devToken, refreshToken: null };
      setCognitoUserSub(getJwtSub(devToken));
      setStatus('signed_in');
      setError(null);
      return;
    }
    setStatus('signing_in');
    setError(null);
    if (!token) {
      setStatus('signed_out');
      setError(getUserFacingError('Access token is required', 'signIn'));
      return;
    }
    tokensRef.current = { idToken: token, refreshToken: refreshToken || null };
    authFailuresRef.current = [];
    setCognitoUserSub(getJwtSub(token));
    setStatus('signed_in');
  }, [isDevMode, devToken]);

  // Async token accessor for the API seam: a fresh token passes through; a
  // stale one refreshes (deduped/throttled in freshToken.js). Refresh failure
  // is NON-TERMINAL — the provider resolves to the best token still held and
  // never signs out here; the 401 path owns that decision. `forceRefresh` is
  // used by managerApi's one-shot 401 retry.
  const getFreshIdToken = useCallback((opts) => {
    if (isDevMode) return Promise.resolve(tokensRef.current.idToken);
    if (!freshTokenRef.current) {
      // Lazily built on first use (not during render): the provider closes
      // over the token ref and owns the dedupe/throttle/rotation rules.
      freshTokenRef.current = createFreshTokenProvider({
        getTokens: () => tokensRef.current,
        setTokens: (next) => { tokensRef.current = next; },
        refresh: refreshTokens,
        onRefreshError: (err) =>
          console.warn('[auth] token refresh failed', flattenErrorForLog(err)),
      });
    }
    return freshTokenRef.current(opts);
  }, [isDevMode]);

  // Called by the API seam after a 401 (post refresh-then-retry). Two causes
  // share the 401 status code, and they need opposite handling:
  //   - the rejected access token is still valid by its own `exp` → the
  //     backend rejected a VALID token (app-client audience not enabled,
  //     policy/authz). Signing out can't fix it and would loop
  //     "session expired" → sign in → 401. Leave the session; the error
  //     surfaces at the call site. (Reads the ACTUAL token's exp, never a
  //     wall-clock age proxy.)
  //   - otherwise the token is expired/absent and refresh couldn't save it →
  //     record a failure and sign out LOCALLY once enough accumulate in the
  //     window (threshold-gated, so a lone transient 401 is tolerated). No
  //     hosted redirect: the SSO cookie likely still allows one-click re-entry.
  const onUnauthorized = useCallback(() => {
    if (isDevMode) return; // dev bypass never expires
    const { idToken } = tokensRef.current;
    if (idToken && isJwtFresh(idToken)) return; // valid token rejected: authz/config, not expiry

    const nowMs = Date.now();
    const recent = authFailuresRef.current.filter((t) => nowMs - t < AUTH_FAILURE_WINDOW_MS);
    recent.push(nowMs);
    authFailuresRef.current = recent;
    if (recent.length < AUTH_FAILURE_THRESHOLD) return;

    signOut({ hosted: false });
    setError(getUserFacingError({ code: 'UNAUTHORIZED', status: 401 }, 'signIn'));
  }, [isDevMode, signOut]);

  const value = useMemo(
    () => ({
      cognitoUserSub,
      status,
      error,
      signIn,
      signOut,
      getFreshIdToken,
      onUnauthorized,
    }),
    [cognitoUserSub, status, error, signIn, signOut, getFreshIdToken, onUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
