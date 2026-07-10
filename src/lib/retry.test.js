import { test, expect } from 'vitest';
import { KioskApiError } from './kioskApi.js';
import {
  isPermanentKioskError,
  retryAfterMsFromError,
  runWithBackoff,
} from './retry.js';

test('isPermanentKioskError classifies terminal vs transient refresh errors', () => {
  expect(
    isPermanentKioskError(new KioskApiError('revoked', { status: 401, code: 'KIOSK_SESSION_REVOKED' })),
  ).toBe(true);
  expect(
    isPermanentKioskError(new KioskApiError('refresh failed', { status: 400, code: 'KIOSK_SESSION_REFRESH_FAILED' })),
  ).toBe(false);
  expect(
    isPermanentKioskError(new KioskApiError('too soon', { status: 429, code: 'KIOSK_REFRESH_TOO_SOON' })),
  ).toBe(false);
  expect(
    isPermanentKioskError(new KioskApiError('bad request', { status: 400, code: 'SOMETHING_ELSE' })),
  ).toBe(true);
});

test('retryAfterMsFromError prefers body field and falls back to header', () => {
  expect(
    retryAfterMsFromError(new KioskApiError('too soon', {
      details: { retry_after_seconds: 12 },
      retryAfter: 5,
    })),
  ).toBe(12_000);
  expect(
    retryAfterMsFromError(new KioskApiError('too soon', {
      details: { error: { retry_after_seconds: 7 } },
    })),
  ).toBe(7_000);
  expect(
    retryAfterMsFromError(new KioskApiError('too soon', { retryAfter: 3 })),
  ).toBe(3_000);
});

test('runWithBackoff retries transient refresh-failed (400) and succeeds', async () => {
  let attempts = 0;
  const result = await runWithBackoff(() => {
    attempts += 1;
    if (attempts === 1) {
      throw new KioskApiError('refresh failed', {
        status: 400,
        code: 'KIOSK_SESSION_REFRESH_FAILED',
      });
    }
    return 'ok';
  }, { schedule: [0] });

  expect(result).toBe('ok');
  expect(attempts).toBe(2);
});

test('runWithBackoff does not retry terminal 401 errors', async () => {
  let attempts = 0;
  await expect(
    runWithBackoff(() => {
      attempts += 1;
      throw new KioskApiError('expired', {
        status: 401,
        code: 'KIOSK_SESSION_EXPIRED',
      });
    }, { schedule: [0, 0] }),
  ).rejects.toMatchObject({ code: 'KIOSK_SESSION_EXPIRED' });
  expect(attempts).toBe(1);
});
