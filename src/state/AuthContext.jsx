import { useCallback, useMemo, useRef, useState } from 'react';
import { getUserFacingError } from '../lib/userErrors.js';
import { getJwtSub, isJwtFresh } from '../lib/jwtUtil.js';
import { buildLogoutUrl, refreshTokens } from '../lib/cognitoHostedUi.js';
import { AuthContext } from './useAuth.js';

// Auth state for an attended app: Cognito tokens live in memory only (never
// web storage — XSS-exfiltratable; seed bundle DECISIONS D6). A page refresh
// drops them and the user signs in again; that's the accepted trade-off (no
// Layer-2 device session — decision #4 in docs/build-plan.md).
//
// Token lifetime: the access token is short-lived (~1h). getFreshAccessToken
// returns the current token while fresh and otherwise runs the refresh-token
// grant against the bridge — deduped so concurrent callers share one refresh
// (mirrors sentinel-ui's authToken.js). Refresh failure signs the user out;
// the login screen restores the session in one click while the Cognito SSO
// cookie is still valid.
//
// VITE_MODE=dev short-circuits to signed_in with a placeholder token (or
// VITE_DEV_MANAGER_JWT) so local development doesn't need Cognito at all.
export function AuthProvider({ children }) {
  const isDevMode = import.meta.env.VITE_MODE === 'dev';
  const devToken = import.meta.env.VITE_DEV_MANAGER_JWT || 'dev';

  // Tokens live in a ref, not state: they rotate silently on refresh and
  // nothing should re-render on rotation. `status` is the render-driving
  // signal.
  const tokensRef = useRef({
    accessToken: isDevMode ? devToken : null,
    refreshToken: null,
  });
  const refreshPromiseRef = useRef(null);

  // Cognito subject identifier — an identifier, not a credential; useful for
  // logging/support correlation.
  const [cognitoUserSub, setCognitoUserSub] = useState(() =>
    isDevMode ? getJwtSub(devToken) : null,
  );
  const [status, setStatus] = useState(() => (isDevMode ? 'signed_in' : 'signed_out'));
  const [error, setError] = useState(null);

  const signOut = useCallback(({ hosted = true } = {}) => {
    const hadToken = Boolean(tokensRef.current.accessToken);
    tokensRef.current = { accessToken: null, refreshToken: null };
    refreshPromiseRef.current = null;
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
    // End the Cognito Hosted UI session too, so "sign out" means signed out
    // — but only when the user explicitly asked (hosted=true). API-driven
    // sign-outs (401s) skip it: the SSO cookie may still be valid and lets
    // the user back in with one click.
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
    tokensRef.current = { accessToken: token, refreshToken: refreshToken || null };
    setCognitoUserSub(getJwtSub(token));
    setStatus('signed_in');
  }, [isDevMode]);

  const getFreshAccessToken = useCallback(async () => {
    if (isDevMode) return devToken;
    const { accessToken, refreshToken } = tokensRef.current;
    if (accessToken && isJwtFresh(accessToken)) return accessToken;
    if (!refreshToken) return accessToken; // stale or null — server will 401, caller handles

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const payload = await refreshTokens({ refreshToken });
          const nextAccess = payload.access_token;
          if (!nextAccess) throw new Error('Token refresh response missing access token.');
          tokensRef.current = {
            accessToken: nextAccess,
            // Cognito doesn't rotate the refresh token by default; keep ours
            // unless the response carries a replacement.
            refreshToken: payload.refresh_token || refreshToken,
          };
          return nextAccess;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();
    }

    try {
      return await refreshPromiseRef.current;
    } catch (err) {
      // Refresh token is dead (revoked/expired) — back to the login screen.
      signOut({ hosted: false });
      throw err;
    }
  }, [isDevMode, devToken, signOut]);

  const value = useMemo(
    () => ({
      cognitoUserSub,
      status,
      error,
      signIn,
      signOut,
      getFreshAccessToken,
    }),
    [cognitoUserSub, status, error, signIn, signOut, getFreshAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
