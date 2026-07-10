import { test, expect } from 'vitest';
import { KioskApiError } from './kioskApi.js';
import { shouldReauthAfterRefreshFailure } from './refreshFailurePolicy.js';

test('reauth on terminal 401 session errors', () => {
  expect(
    shouldReauthAfterRefreshFailure(new KioskApiError('expired', { status: 401, code: 'KIOSK_SESSION_EXPIRED' })),
  ).toBe(true);
  expect(
    shouldReauthAfterRefreshFailure(new KioskApiError('revoked', { status: 401, code: 'KIOSK_SESSION_REVOKED' })),
  ).toBe(true);
});

test('no immediate reauth on transient refresh failures', () => {
  expect(
    shouldReauthAfterRefreshFailure(
      new KioskApiError('refresh failed', { status: 400, code: 'KIOSK_SESSION_REFRESH_FAILED' }),
    ),
  ).toBe(false);
  expect(
    shouldReauthAfterRefreshFailure(new KioskApiError('too soon', { status: 429, code: 'KIOSK_REFRESH_TOO_SOON' })),
  ).toBe(false);
  expect(
    shouldReauthAfterRefreshFailure(new KioskApiError('upstream unavailable', { status: 503 })),
  ).toBe(false);
});

test('unknown 4xx on refresh is treated as terminal', () => {
  expect(
    shouldReauthAfterRefreshFailure(new KioskApiError('bad request', { status: 400, code: 'SOMETHING_ELSE' })),
  ).toBe(true);
});
