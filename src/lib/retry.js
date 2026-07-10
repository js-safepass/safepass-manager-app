// Retry helpers — the single place that decides whether a backend error is
// permanent (give up / re-auth) or transient (back off and retry). Nothing
// else in the app makes this call (DECISIONS D13 in the seed bundle).
//
// Adapted from the kiosk chassis 2026-07-10: classification logic copied
// verbatim; the kiosk-session-specific code exceptions were removed because
// the manager surface has no device session. Add manager-surface exceptions
// here (with a dated backend confirmation) as they are discovered.

import { ManagerApiError } from './managerApi.js';

// Exponential schedule: 5s, 15s, 45s, 2m, 4m. Five attempts after the
// initial call, ~7 minutes total before we give up.
export const TRANSIENT_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 240_000];

// Error codes that should never be retried regardless of status — currently
// none on the manager surface; the status-based rules below (401/403/404 and
// other 4xx are permanent) carry the classification.
const PERMANENT_CODES = new Set([]);

export function isPermanentApiError(error) {
  if (!(error instanceof ManagerApiError)) return false;
  // 429 (rate limited / queue full) is always retryable, honoring Retry-After.
  if (error.status === 429) return false;
  if (error.status >= 500) return false;
  if (error.status === 401 || error.status === 403 || error.status === 404) return true;
  if (error.code && PERMANENT_CODES.has(error.code)) return true;
  if (error.status >= 400 && error.status < 500) return true;
  return false;
}

// Server-suggested retry delay (ms) if the error carries one, else null.
// The problem body's `retry_after_seconds` is canonical; the Retry-After
// HTTP header is the fallback (managerApi.js surfaces it onto
// error.retryAfter). Capped at 10 minutes so a pathological server value
// can't stall a retry loop indefinitely.
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
// errors (per isPermanentApiError) re-throw immediately. Abort via the
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
      if (isPermanentApiError(error)) throw error;
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
