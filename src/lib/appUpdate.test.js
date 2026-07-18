// Coverage for the self-update logic. shouldReload() gates a page
// reload, so its branches are pinned exhaustively. checkForDeployedUpdate() —
// the fetch + guard + reload wiring — is also covered here (a previous version
// left it untested): a silently-failed reload must retry a bounded number of
// times rather than either looping forever or sticking permanently after one
// try.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  shouldReload,
  checkForDeployedUpdate,
  getCurrentBuildId,
  MAX_RELOAD_ATTEMPTS,
  VERSION_FETCH_TIMEOUT_MS,
} from './appUpdate.js';

describe('shouldReload — self-update decision', () => {
  const base = { currentBuildId: 'A', remoteBuildId: 'B', attempts: 0 };

  test('reloads when a different build is deployed', () => {
    expect(shouldReload(base)).toBe(true);
  });

  test('no reload when the deployed build matches the running build', () => {
    expect(shouldReload({ ...base, remoteBuildId: 'A' })).toBe(false);
  });

  test('no reload when the running build id is unknown (not injected)', () => {
    expect(shouldReload({ ...base, currentBuildId: null })).toBe(false);
  });

  test('no reload when the deployed build id is missing/blank', () => {
    expect(shouldReload({ ...base, remoteBuildId: null })).toBe(false);
    expect(shouldReload({ ...base, remoteBuildId: '' })).toBe(false);
  });

  test('keeps retrying while under the attempt cap', () => {
    expect(shouldReload({ ...base, attempts: MAX_RELOAD_ATTEMPTS - 1 })).toBe(true);
  });

  test('stops once attempts reach the cap — no infinite loop, no perma-stick after one try', () => {
    expect(shouldReload({ ...base, attempts: MAX_RELOAD_ATTEMPTS })).toBe(false);
    expect(shouldReload({ ...base, attempts: MAX_RELOAD_ATTEMPTS + 5 })).toBe(false);
  });

  test('respects an explicit maxAttempts override', () => {
    expect(shouldReload({ ...base, attempts: 1, maxAttempts: 1 })).toBe(false);
  });
});

describe('checkForDeployedUpdate — fetch + guard + reload wiring', () => {
  const versionResponse = (buildId) =>
    new Response(JSON.stringify({ buildId }), { status: 200 });

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  test('reloads once when a newer build is deployed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(versionResponse(`${getCurrentBuildId()}-next`));
    const reload = vi.fn();
    expect(await checkForDeployedUpdate({ reload })).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  test('does not reload when the deployed build matches the running build', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(versionResponse(getCurrentBuildId()));
    const reload = vi.fn();
    expect(await checkForDeployedUpdate({ reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test('does not reload on a non-200 /version.json response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    const reload = vi.fn();
    expect(await checkForDeployedUpdate({ reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test('never throws on a network error — just declines to reload', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const reload = vi.fn();
    expect(await checkForDeployedUpdate({ reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test('aborts a hung probe past the timeout and declines to reload', async () => {
    vi.useFakeTimers();
    try {
      // A fetch that never resolves on its own — it only settles when the
      // request's AbortSignal fires (real fetch rejects with an AbortError).
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }));
      const reload = vi.fn();
      const pending = checkForDeployedUpdate({ reload });
      await vi.advanceTimersByTimeAsync(VERSION_FETCH_TIMEOUT_MS + 100);
      expect(await pending).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a reload that never takes effect retries up to the cap, then gives up (no perma-stick, no loop)', async () => {
    // reload is a no-op spy → the page never actually restarts, so the build
    // id stays mismatched on every poll. The guard must bound the retries.
    // mockImplementation (not mockResolvedValue) so each poll gets a fresh
    // Response — a Response body can only be read once.
    const nextBuildId = `${getCurrentBuildId()}-next`;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(versionResponse(nextBuildId)));
    const reload = vi.fn();
    for (let i = 0; i < MAX_RELOAD_ATTEMPTS + 3; i += 1) {
      await checkForDeployedUpdate({ reload });
    }
    expect(reload).toHaveBeenCalledTimes(MAX_RELOAD_ATTEMPTS);
  });
});
