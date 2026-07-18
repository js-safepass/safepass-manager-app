import { useCallback, useMemo, useRef, useState } from 'react';
import { getUserFacingError } from '../lib/userErrors.js';
import { getJwtSub } from '../lib/jwtUtil.js';
import { flattenErrorForLog } from '../lib/errorLog.js';
import { refreshTokens } from '../lib/cognitoHostedUi.js';
import { createFreshTokenProvider } from '../lib/freshToken.js';
import { AUTH_ACTION, resolveAuthAction } from '../lib/authActions.js';
import { createAuthFailurePolicy } from '../lib/authFailurePolicy.js';
import { purgeBrowserSession, redirectToHostedLogout } from '../lib/sessionCleanup.js';
import { AuthContext } from './useAuth.js';

// Auth state for an attended app: Cognito tokens live in memory only (never
// web storage — XSS-exfiltratable; seed bundle DECISIONS D6). A page refresh
// drops them and the user signs in again; that's the accepted trade-off (no
// Layer-2 device session — decision #4 in docs/build-plan.md).
//
// Token lifetime: the bearer is the Cognito ID token (auth-contract §1) and is
// short-lived; getFreshIdToken silently runs the refresh-token grant when it
// goes stale — front-desk sessions run all day and must not be interrupted by
// forced re-logins. The refresh rules (dedupe, throttle, rotation, race guard)
// live in lib/freshToken.js where they're unit-tested.
//
// Resilience model ported from sentinel-ui via the mapping app (2026-07-13),
// hardened for 15-minute ID tokens (2026-07-18): a refresh FAILURE is
// non-terminal (freshToken.js resolves to the best token it still holds), and
// the sign-out decision lives ONLY on the 401 path below, owned by
// lib/authFailurePolicy.js — transient renew failures never count toward a
// forced sign-out; only definitive session death (revoked/expired refresh
// token, or nothing left to renew with) is threshold-gated into one.
//
// VITE_MODE=dev short-circuits to signed_in with a placeholder token (or
// VITE_DEV_MANAGER_JWT) so local development doesn't need Cognito at all.

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
  // The forced-sign-out decision for plain 401s (strikes + renew-failure
  // classification) — pure and unit-tested in lib/authFailurePolicy.js.
  const failurePolicyRef = useRef(null);
  if (!failurePolicyRef.current) failurePolicyRef.current = createAuthFailurePolicy();

  const signOut = useCallback(({ hosted = true } = {}) => {
    const hadToken = Boolean(tokensRef.current.idToken);
    tokensRef.current = { idToken: null, refreshToken: null };
    freshTokenRef.current = null; // drop the provider's in-flight/throttle state
    failurePolicyRef.current.reset();
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
    // An EXPLICIT sign-out (hosted=true — the navbar button) must be a REAL
    // logout: purge local session residue, then redirect through the Cognito
    // hosted /logout endpoint — the only thing that kills the managed-login
    // SSO cookie. Without that redirect the next "Continue" click silently
    // re-authenticates WITHOUT credentials (web-UI QA bug class, 2026-07-18).
    // API-driven sign-outs (hosted=false) deliberately skip both: they exist
    // to force a RE-login (auth-contract §5 — 401 → re-auth → resume), where
    // the surviving SSO cookie's one-click re-entry and the persisted
    // org/scope selection are the point, not a leak.
    if (hosted && !isDevMode) {
      purgeBrowserSession();
      // Degrades to a local-only sign-out (returns false) if the hosted-UI
      // config is missing — local state is already cleared above.
      if (hadToken) redirectToHostedLogout();
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
    failurePolicyRef.current.reset();
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
        // setTokens only runs when a refresh COMMITS — feed that success to
        // the failure policy so a stale transient-failure record can't
        // linger past a working renewal.
        setTokens: (next) => {
          tokensRef.current = next;
          failurePolicyRef.current.noteRefreshSuccess();
        },
        refresh: refreshTokens,
        // LOGGING + CLASSIFICATION only — never terminal here. The policy
        // records whether this failure was definitive (dead refresh token)
        // or transient (bridge blip); the 401 path consults that record.
        onRefreshError: (err) => {
          failurePolicyRef.current.noteRefreshFailure(err);
          console.warn('[auth] token refresh failed', flattenErrorForLog(err));
        },
      });
    }
    return freshTokenRef.current(opts);
  }, [isDevMode]);

  // Called by the API seam on any auth-relevant failure, WITH the RFC-7807
  // code ({ code, status }). Branch on the code (auth-contract §2) — each drives
  // a distinct recovery. `resolveAuthAction` owns the mapping.
  const onUnauthorized = useCallback((info = {}) => {
    if (isDevMode) return; // dev bypass never expires
    const code = info?.code;
    const action = resolveAuthAction(code);

    // Terminal: account deactivated/archived. The backend already global-signed
    // out; end the local session with a clear reason (no re-entry).
    if (action === AUTH_ACTION.TERMINAL) {
      signOut({ hosted: false });
      setError(getUserFacingError({ code, status: info?.status }, 'signIn'));
      return;
    }

    // Re-auth: the session was revoked server-side (a global sign-out), or
    // ID_TOKEN_REQUIRED fired (a bearer/config fault we log for diagnosis).
    // Sign out LOCALLY and let the user re-login — Login stashed the return
    // path, so they resume where they were. No hosted redirect: the SSO cookie
    // likely allows one-click re-entry.
    if (action === AUTH_ACTION.REAUTH) {
      if (code === 'ID_TOKEN_REQUIRED') {
        // Should not happen now the bearer is the ID token — flag it loudly.
        console.error('[auth] ID_TOKEN_REQUIRED with an ID-token bearer — check REQUIRE_ID_TOKEN_BEARER / app-client audience config');
      }
      signOut({ hosted: false });
      setError(getUserFacingError({ code, status: info?.status }, 'signIn'));
      return;
    }

    // EXPIRY (plain/unknown 401): the policy decides. A still-fresh token or
    // a TRANSIENT renew failure (bridge 5xx, network) never signs out — with
    // 15-minute tokens a whole poll burst can 401 during one bridge blip and
    // that must not end a working front-desk session. Only definitive
    // failures (dead refresh token / nothing to renew with) count, threshold-
    // gated. Rules + rationale live in lib/authFailurePolicy.js.
    const { idToken } = tokensRef.current;
    if (!failurePolicyRef.current.shouldSignOut({ idToken })) return;

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
