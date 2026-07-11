import { useCallback, useMemo, useState } from 'react';
import { getUserFacingError } from '../lib/userErrors.js';
import { getJwtSub } from '../lib/jwtUtil.js';
import { AuthContext } from './useAuth.js';

// Auth state for an attended app: the Cognito access token lives in memory
// only (never web storage — XSS-exfiltratable; seed bundle DECISIONS D6).
// A page refresh drops the token and the user signs in again; that's the
// accepted trade-off for this app (no Layer-2 device session — decision #4
// in docs/build-plan.md).
//
// VITE_MODE=dev short-circuits to signed_in with a placeholder (or
// VITE_DEV_MANAGER_JWT) so local development doesn't need the Cognito app
// client — which is not provisioned yet as of 2026-07-10.
export function AuthProvider({ children }) {
  const isDevMode = import.meta.env.VITE_MODE === 'dev';
  const devToken = import.meta.env.VITE_DEV_MANAGER_JWT || 'dev';

  const [accessToken, setAccessToken] = useState(isDevMode ? devToken : null);
  // Cognito subject identifier — an identifier, not a credential; useful for
  // logging/support correlation. Extracted from the JWT at sign-in.
  const [cognitoUserSub, setCognitoUserSub] = useState(() =>
    isDevMode ? getJwtSub(devToken) : null,
  );
  const [status, setStatus] = useState(() => (isDevMode ? 'signed_in' : 'signed_out'));
  const [error, setError] = useState(null);

  const signIn = useCallback(async ({ token }) => {
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
    setAccessToken(token);
    setCognitoUserSub(getJwtSub(token));
    setStatus('signed_in');
  }, [isDevMode]);

  const signOut = useCallback(() => {
    setAccessToken(null);
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      cognitoUserSub,
      status,
      error,
      signIn,
      signOut,
    }),
    [accessToken, cognitoUserSub, status, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
