import { afterEach, describe, expect, test } from 'vitest';
import { consumeReturnTo, stashReturnTo } from './returnPath.js';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('returnPath', () => {
  test('round-trips a safe in-app path and clears it (read-once)', () => {
    stashReturnTo('/visitors', '?status=active');
    expect(consumeReturnTo()).toBe('/visitors?status=active');
    // Cleared after consuming — a stale path can't hijack the next sign-in.
    expect(consumeReturnTo()).toBe('/');
  });

  test('defaults to root when nothing is stashed', () => {
    expect(consumeReturnTo()).toBe('/');
  });

  test('never stashes the auth callback/logout routes', () => {
    stashReturnTo('/auth/callback', '?code=abc');
    expect(consumeReturnTo()).toBe('/');
  });

  test('rejects protocol-relative / cross-origin paths (open-redirect guard)', () => {
    // Force a hostile value straight into storage, then verify consume rejects it.
    window.sessionStorage.setItem('manager_return_to', '//evil.example.com/phish');
    expect(consumeReturnTo()).toBe('/');
  });

  test('ignores a non-path value', () => {
    window.sessionStorage.setItem('manager_return_to', 'https://evil.example.com');
    expect(consumeReturnTo()).toBe('/');
  });
});
