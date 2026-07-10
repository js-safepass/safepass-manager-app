// Retry helpers shared between refreshSession and restore-validate.
//
// The kiosk has two paths that must classify backend errors and decide
// whether to give up or back off:
//   - refreshSession: a transient 5xx or network blip should not kick the
//     kiosk to reauth. Only an authoritative 401/403/404 or a known
//     terminal error code should.
//   - restore-validate: same logic for the on-launch /v1/kiosk/session/me
//     call so a backend deploy blip doesn't wipe every iPad's Keychain.
//
// See docs/unattended-session-longevity.md §"Refresh retry policy".

import { KioskApiError } from './kioskApi.js';

// Exponential schedule: 5s, 15s, 45s, 2m, 4m. Five attempts after the
// initial call, ~7 minutes total before we give up and trigger reauth.
export const TRANSIENT_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 240_000];

// Error codes that should never be retried — the session is invalid,
// revoked, or otherwise unrecoverable without a fresh sign-in.
// Includes both today's codes and PR1's planned additions; entries that
// don't yet appear in server output are harmless until they do.
const PERMANENT_CODES = new Set([
  'KIOSK_SESSION_REVOKED',
  'KIOSK_SESSION_INVALID',
  'KIOSK_SESSION_REQUIRED',
  'KIOSK_DPOP_INVALID',
  'KIOSK_DPOP_REPLAY',
  'KIOSK_DPOP_REQUIRED',
  'KIOSK_SESSION_MAX_EXPIRED',
  'KIOSK_SESSION_EXPIRED',
  'KIOSK_SESSION_LOCKOUT',
  'KIOSK_STATION_DISABLED',
  'KIOSK_STATION_REASSIGNED',
  'KIOSK_UNLOCK_SESSION_RESET_REQUIRED',
]);

export function isPermanentKioskError(error) {
  if (!(error instanceof KioskApiError)) return false;
  if (error.code === 'KIOSK_REFRESH_TOO_SOON') return false;
  if (error.status === 400 && error.code === 'KIOSK_SESSION_REFRESH_FAILED') return false;
  if (error.status === 429) return false;
  if (error.status >= 500) return false;
  if (error.status === 401 || error.status === 403 || error.status === 404) return true;
  if (error.code && PERMANENT_CODES.has(error.code)) return true;
  if (error.status >= 400 && error.status < 500) return true;
  return false;
}

// Server-suggested retry delay (ms) if the error carries one, else null.
// PR1 spec puts the value in the problem body as `retry_after_seconds`
// for 429 KIOSK_REFRESH_TOO_SOON responses, and also as a Retry-After
// HTTP header. Body is canonical; header is the fallback (kioskApi.js
// surfaces it onto error.retryAfter for us). Capped at 10 minutes so a
// pathological server value can't stall the kiosk indefinitely.
export function retryAfterMsFromError(error) {
  const bodySeconds = error?.details?.retry_after_seconds;
  if (typeof bodySeconds === 'number' && bodySeconds > 0) {
    return Math.min(bodySeconds, 600) * 1000;
  }
  const nestedBodySeconds = error?.details?.error?.retry_after_seconds;
  if (typeof nestedBodySeconds === 'number' && nestedBodySeconds > 0) {
    return Math.min(nestedBodySeconds, 600) * 1000;
  }
  const headerSeconds = error?.retryAfter;
  if (typeof headerSeconds === 'number' && headerSeconds > 0) {
    return Math.min(headerSeconds, 600) * 1000;
  }
  return null;
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener?.('abort', onAbort);
  });
}

// Run an async operation with backoff on transient failures. Permanent
// errors (per isPermanentKioskError) re-throw immediately. Abort via the
// passed AbortSignal cancels both in-flight sleeps and the loop.
//
// onTransientFailure(error, nextDelayMs, attempt) is invoked between
// attempts so callers can flip UI state back to a non-spinner mode
// during the wait.
export async function runWithBackoff(fn, {
  signal,
  onTransientFailure,
  schedule = TRANSIENT_BACKOFF_MS,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= schedule.length; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      return await fn({ attempt });
    } catch (error) {
      lastError = error;
      if (isPermanentKioskError(error)) throw error;
      if (attempt === schedule.length) throw error;
      const delay = retryAfterMsFromError(error) ?? schedule[attempt];
      try {
        onTransientFailure?.(error, delay, attempt);
      } catch (hookErr) {
        console.warn('runWithBackoff onTransientFailure hook threw', hookErr);
      }
      await abortableSleep(delay, signal);
    }
  }
  throw lastError;
}
