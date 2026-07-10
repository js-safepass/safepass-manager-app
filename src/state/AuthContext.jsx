import { useCallback, useMemo, useState } from 'react';
import { getUserFacingError } from '../lib/userErrors.js';
import { wipeKioskCredentials } from '../lib/kioskCredentials.js';
import { getJwtSub } from '../lib/jwtUtil.js';
import { isNative } from '../lib/platform.js';
import { AuthContext } from './useAuth.js';

export function AuthProvider({ children }) {
  const isDevMode = import.meta.env.VITE_MODE === 'dev';
  const devToken = import.meta.env.VITE_DEV_KIOSK_JWT || 'dev';

  const [kioskJwt, setKioskJwt] = useState(isDevMode ? devToken : null);
  // Cognito subject identifier — extracted from the JWT at sign-in time and
  // retained even after the JWT itself is purged at lock. Used by
  // persistKioskCredentials to bind a Keychain entry to the staff user so
  // restore on a shared device rejects entries from a different operator.
  // Possessing the `sub` doesn't authorize anything against the backend; it's
  // an identifier, not a credential.
  const [cognitoUserSub, setCognitoUserSub] = useState(() =>
    isDevMode ? getJwtSub(devToken) : null,
  );
  // Note: `status` is intentionally decoupled from `kioskJwt`. After a
  // successful kiosk-session lock we purge the JWT (Phase 8 of the
  // unattended-session-longevity initiative) but keep `status='signed_in'`
  // so App.jsx continues rendering the kiosk view instead of bouncing back
  // to Login. status flips to 'signed_out' only via the explicit signOut()
  // path below — which resetSession invokes on every kiosk-session teardown.
  //
  // 'checking_restore' is a Phase 9 transitional state used on native cold
  // start: before showing Login, KioskSessionContext attempts an unattended
  // Keychain restore (session_token + DPoP — no Cognito needed). On success
  // we flip to 'signed_in' using the persisted cognitoUserSub; on failure
  // we fall through to 'signed_out'. Web has no Keychain so it starts
  // 'signed_out' as before. Dev mode short-circuits to 'signed_in'.
  const [status, setStatus] = useState(() => {
    if (isDevMode) return 'signed_in';
    if (isNative) return 'checking_restore';
    return 'signed_out';
  });
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
      setError(getUserFacingError('Kiosk JWT is required', 'signIn'));
      return;
    }
    setKioskJwt(token);
    setCognitoUserSub(getJwtSub(token));
    setStatus('signed_in');
  }, [isDevMode]);

  // Purge the live JWT but keep the operator authenticated for kiosk-side
  // flows. Called from KioskSessionContext.lockSession on successful lock.
  // The retained `cognitoUserSub` allows persistKioskCredentials to keep
  // binding rotated session tokens (from later refreshes) to the same user
  // without the JWT in memory.
  //
  // Safe to call when the JWT is already null (idempotent).
  const clearKioskJwt = useCallback(() => {
    setKioskJwt(null);
  }, []);

  // Phase 9: KioskSessionContext calls this when an unattended Keychain
  // restore succeeds on cold start. Flips status to 'signed_in' using the
  // persisted Cognito user sub — without ever acquiring a live JWT. The
  // kiosk session_token + DPoP key are sufficient for every post-start
  // backend call (verified by the API inventory), so the operator never
  // needs to be present for a reboot recovery.
  const setSignedInFromRestore = useCallback((persistedCognitoUserSub) => {
    setCognitoUserSub(persistedCognitoUserSub || null);
    setKioskJwt(null);
    setError(null);
    setStatus('signed_in');
  }, []);

  // Phase 9: called when unattended restore on cold start cannot proceed —
  // no Keychain entry, validation rejected by the server, retries
  // exhausted, etc. Falls through to the normal signed-out / Login flow.
  // signOut() is reused so any stale state is consistently wiped.
  const markUnattendedRestoreFailed = useCallback(() => {
    setKioskJwt(null);
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
    wipeKioskCredentials().catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    setKioskJwt(null);
    setCognitoUserSub(null);
    setStatus('signed_out');
    setError(null);
    // Belt-and-suspenders: also wipe the persisted kiosk credentials.
    // KioskSessionContext.resetSession is the primary owner of this wipe,
    // but signOut paths that bypass resetSession (e.g. forced re-auth)
    // shouldn't leave stale Keychain state behind.
    wipeKioskCredentials().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      kioskJwt,
      cognitoUserSub,
      status,
      error,
      signIn,
      signOut,
      clearKioskJwt,
      setSignedInFromRestore,
      markUnattendedRestoreFailed,
    }),
    [
      kioskJwt,
      cognitoUserSub,
      status,
      error,
      signIn,
      signOut,
      clearKioskJwt,
      setSignedInFromRestore,
      markUnattendedRestoreFailed,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
