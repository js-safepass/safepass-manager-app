import { test, expect } from 'vitest';
import { ManagerApiError } from './managerApi.js';
import {
  isPermanentApiError,
  retryAfterMsFromError,
  runWithBackoff,
} from './retry.js';

test('isPermanentApiError classifies terminal vs transient errors', () => {
  // Authoritative auth failures are permanent — polling loops must stop.
  expect(
    isPermanentApiError(new ManagerApiError('unauthorized', { status: 401, code: 'UNAUTHORIZED' })),
  ).toBe(true);
  expect(
    isPermanentApiError(new ManagerApiError('gone', { status: 404, code: 'NOT_FOUND' })),
  ).toBe(true);
  // Rate limiting and 5xx are transient.
  expect(
    isPermanentApiError(new ManagerApiError('queue full', { status: 429, code: 'CHECKIN_QUEUE_FULL' })),
  ).toBe(false);
  expect(
    isPermanentApiError(new ManagerApiError('server error', { status: 503, code: 'CHECKIN_UNAVAILABLE' })),
  ).toBe(false);
  // Other 4xx are the caller's bug or a business gate — never retried blind.
  expect(
    isPermanentApiError(new ManagerApiError('bad request', { status: 400, code: 'INVALID_FILTER' })),
  ).toBe(true);
  // Non-ManagerApiError (network blip, TypeError) stays transient.
  expect(isPermanentApiError(new TypeError('failed to fetch'))).toBe(false);
});

test('retryAfterMsFromError prefers body field and falls back to header', () => {
  expect(
    retryAfterMsFromError(new ManagerApiError('too soon', {
      details: { retry_after_seconds: 12 },
      retryAfter: 5,
    })),
  ).toBe(12_000);
  expect(
    retryAfterMsFromError(new ManagerApiError('too soon', {
      details: { error: { retry_after_seconds: 7 } },
    })),
  ).toBe(7_000);
  expect(
    retryAfterMsFromError(new ManagerApiError('too soon', { retryAfter: 3 })),
  ).toBe(3_000);
});

test('runWithBackoff retries transient errors and succeeds', async () => {
  let attempts = 0;
  const result = await runWithBackoff(() => {
    attempts += 1;
    if (attempts === 1) {
      throw new ManagerApiError('unavailable', {
        status: 503,
        code: 'CHECKIN_UNAVAILABLE',
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
      throw new ManagerApiError('expired', {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    }, { schedule: [0, 0] }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(attempts).toBe(1);
});
