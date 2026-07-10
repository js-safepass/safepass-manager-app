import { isPermanentKioskError } from './retry.js';

// Decides whether refresh failure should force reauth.
// Aborts are handled by the caller and should not pass through here.
export function shouldReauthAfterRefreshFailure(error) {
  return isPermanentKioskError(error);
}

