import { afterEach, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScopedPolling } from './useScopedPolling.js';

afterEach(() => {
  vi.useRealTimers();
});

function authError(status, code) {
  const err = new Error(code || `status ${status}`);
  err.status = status;
  err.code = code;
  return err;
}

test('a 401 (e.g. an MFA gate) halts the loop — it does not spin every interval', async () => {
  vi.useFakeTimers();
  const poll = vi.fn(async () => { throw authError(401, 'MFA_REQUIRED'); });

  renderHook(() =>
    useScopedPolling({ channel: 'test-401', poll, intervalMs: 1000, requireVisible: false }));

  await vi.advanceTimersByTimeAsync(1000); // first tick -> 401 -> halt
  expect(poll).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(10_000); // plenty of intervals later
  expect(poll).toHaveBeenCalledTimes(1); // never rescheduled — loop terminated
});

test('a transient 500 keeps polling (only auth/permission errors halt)', async () => {
  vi.useFakeTimers();
  const poll = vi.fn(async () => { throw authError(500); });

  renderHook(() =>
    useScopedPolling({ channel: 'test-500', poll, intervalMs: 1000, requireVisible: false }));

  await vi.advanceTimersByTimeAsync(1000);
  expect(poll).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(poll).toHaveBeenCalledTimes(2); // rescheduled — transient errors recover
});
