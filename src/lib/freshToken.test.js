import { describe, expect, test, vi } from 'vitest';
import { createFreshTokenProvider } from './freshToken.js';

function makeStore(initial) {
  let tokens = { ...initial };
  return {
    getTokens: () => tokens,
    setTokens: (next) => { tokens = { ...next }; },
    read: () => tokens,
  };
}

// Controllable freshness: tokens named 'fresh*' are fresh, others stale.
const byName = (token) => String(token).startsWith('fresh');

// Most tests don't care about the throttle; open it fully unless testing it.
const noThrottle = { minRefreshIntervalMs: 0 };

describe('createFreshTokenProvider', () => {
  test('fresh bearer passes through without refreshing', async () => {
    const store = makeStore({ idToken: 'fresh-1', refreshToken: 'r1' });
    const refresh = vi.fn();
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('fresh-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  test('stale bearer triggers the refresh grant and stores the new id token', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    // The refresh grant returns a fresh id_token (the bearer) alongside the
    // access token; the provider must carry the id_token, not the access token.
    const refresh = vi.fn().mockResolvedValue({ id_token: 'fresh-2', access_token: 'acc-2' });
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('fresh-2');
    expect(refresh).toHaveBeenCalledWith({ refreshToken: 'r1' });
    // Cognito doesn't rotate by default: the old refresh token is kept.
    expect(store.read()).toEqual({ idToken: 'fresh-2', refreshToken: 'r1' });
  });

  test('the bearer is the id token, never the access token', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    const refresh = vi.fn().mockResolvedValue({ id_token: 'fresh-id', access_token: 'fresh-access' });
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('fresh-id');
    expect(store.read().idToken).toBe('fresh-id');
  });

  test('a rotated refresh token from the response replaces the stored one', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    const refresh = vi.fn().mockResolvedValue({ id_token: 'fresh-2', refresh_token: 'r2' });
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    await get();
    expect(store.read().refreshToken).toBe('r2');
  });

  test('concurrent callers share ONE in-flight refresh', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    let release;
    const refresh = vi.fn(() => new Promise((resolve) => {
      release = () => resolve({ id_token: 'fresh-2' });
    }));
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    const [a, b, c] = [get(), get(), get()];
    release();
    await expect(Promise.all([a, b, c])).resolves.toEqual(['fresh-2', 'fresh-2', 'fresh-2']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('sequential refreshes are throttled: a second stale read inside the window is not refreshed', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    const refresh = vi.fn().mockResolvedValue({ id_token: 'stale-2' }); // stays stale by our rule
    let clock = 1_000;
    const get = createFreshTokenProvider({
      ...store, refresh, isFresh: byName, minRefreshIntervalMs: 10_000, now: () => clock,
    });
    await get();                 // fires the grant
    clock += 5_000;              // still inside the 10s window
    await expect(get()).resolves.toBe('stale-2'); // returns the held token, no new grant
    expect(refresh).toHaveBeenCalledTimes(1);
    clock += 6_000;              // window elapsed
    await get();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('forceRefresh bypasses both freshness and the throttle', async () => {
    const store = makeStore({ idToken: 'fresh-1', refreshToken: 'r1' });
    const refresh = vi.fn().mockResolvedValue({ id_token: 'fresh-2' });
    let clock = 1_000;
    const get = createFreshTokenProvider({
      ...store, refresh, isFresh: byName, minRefreshIntervalMs: 10_000, now: () => clock,
    });
    await get({ forceRefresh: true });          // refreshes despite fresh token
    clock += 100;                               // well inside the throttle window
    await get({ forceRefresh: true });          // refreshes again despite throttle
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('no refresh token: returns the current token so the server 401 drives recovery', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: null });
    const refresh = vi.fn();
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('stale-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  test('refresh failure is NON-TERMINAL: returns the held token, logs, does not throw', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r-dead' });
    const refresh = vi.fn().mockRejectedValue(new Error('invalid_grant'));
    const onRefreshError = vi.fn();
    const get = createFreshTokenProvider({ ...store, refresh, onRefreshError, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('stale-1'); // best token still held
    expect(onRefreshError).toHaveBeenCalledTimes(1);
    expect(store.read().refreshToken).toBe('r-dead'); // nothing cleared here — sign-out is the 401 path's job
  });

  test('failure is logged ONCE even with many concurrent waiters', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r-dead' });
    const refresh = vi.fn().mockRejectedValue(new Error('invalid_grant'));
    const onRefreshError = vi.fn();
    const get = createFreshTokenProvider({ ...store, refresh, onRefreshError, isFresh: byName, ...noThrottle });
    await Promise.all([get(), get(), get()]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onRefreshError).toHaveBeenCalledTimes(1);
  });

  test('a refresh response without an id token is a non-terminal failure', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    // Only an access token came back — no id_token means no valid bearer.
    const refresh = vi.fn().mockResolvedValue({ access_token: 'acc-only', token_type: 'Bearer' });
    const onRefreshError = vi.fn();
    const get = createFreshTokenProvider({ ...store, refresh, onRefreshError, isFresh: byName, ...noThrottle });
    await expect(get()).resolves.toBe('stale-1');
    expect(onRefreshError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/missing an id token/i) }),
    );
  });

  test('race guard: a refresh that resolves after sign-out does NOT resurrect tokens', async () => {
    const store = makeStore({ idToken: 'stale-1', refreshToken: 'r1' });
    let release;
    const refresh = vi.fn(() => new Promise((resolve) => {
      release = () => resolve({ id_token: 'fresh-2', refresh_token: 'r2' });
    }));
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    const pending = get();
    // Sign-out happens while the grant is in flight.
    store.setTokens({ idToken: null, refreshToken: null });
    release();
    await expect(pending).resolves.toBeNull();       // does not hand back the resurrected token
    expect(store.read()).toEqual({ idToken: null, refreshToken: null }); // not written back
  });

  test('race guard: a refresh resolving after a NEW sign-in yields the new session token', async () => {
    const store = makeStore({ idToken: 'stale-A', refreshToken: 'rA' });
    let release;
    const refresh = vi.fn(() => new Promise((resolve) => {
      release = () => resolve({ id_token: 'fresh-A2', refresh_token: 'rA2' });
    }));
    const get = createFreshTokenProvider({ ...store, refresh, isFresh: byName, ...noThrottle });
    const pending = get();
    // User B signs in before A's refresh resolves.
    store.setTokens({ idToken: 'fresh-B', refreshToken: 'rB' });
    release();
    await expect(pending).resolves.toBe('fresh-B');  // B's token, not A's refreshed one
    expect(store.read()).toEqual({ idToken: 'fresh-B', refreshToken: 'rB' });
  });
});
