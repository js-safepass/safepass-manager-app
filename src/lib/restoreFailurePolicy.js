// Decision logic for the KioskSessionContext restore-validate catch.
//
// When the on-cold-start restore-validate (`GET /v1/kiosk/session/me`)
// throws, this helper decides whether to:
//
//   - 'abort'    — caller's AbortController fired; clean cancellation,
//                  no side effects, the outer cleanup handles teardown
//   - 'wipe'     — auth-permanent failure (401/403/404 or a terminal
//                  KIOSK_* code). The persisted session is genuinely
//                  dead — revoke, expiry, fingerprint mismatch. Wipe
//                  the Keychain entry and fall through to fresh Setup.
//   - 'preserve' — transient failure (network error, 5xx, timeout).
//                  Persisted creds are likely still valid server-side;
//                  do NOT wipe, leave the restore overlay up, reset the
//                  once-only attempt guard so a connectivity recovery
//                  can re-fire the effect.
//
// This is the load-bearing decision in the cold-start-during-outage
// recovery path — without correct classification a brief wifi blip at
// boot would force fresh Setup the next time the operator comes back
// online (the pre-Phase-9 behavior we explicitly hardened against).
//
// Extracted from KioskSessionContext so the decision can be tested as a
// pure function. The actions (calling wipeCredentials / resetting refs
// / dispatching reset) stay in the context; only the classification
// lives here.
//
// Cases:
//   AbortError                     → 'abort'
//   isPermanentKioskError(err)     → 'wipe'
//   anything else (including
//   network errors that are not
//   KioskApiError instances)       → 'preserve'

import { isPermanentKioskError } from './retry.js';

export function classifyRestoreFailure(err) {
  if (err && err.name === 'AbortError') return 'abort';
  if (isPermanentKioskError(err)) return 'wipe';
  return 'preserve';
}
