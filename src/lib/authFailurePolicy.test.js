// Pins the renew-resilience rules under 15-minute ID tokens: transient renew
// failures NEVER force a sign-out (the web-UI 2-strike footgun, deliberately
// not ported); only definitive session death is threshold-gated into one.

import { expect, test } from 'vitest';
import { createAuthFailurePolicy } from './authFailurePolicy.js';

const FRESH = 'fresh-token';
const STALE = 'stale-token';

function makePolicy(overrides = {}) {
  let t = 1_000_000;
  const policy = createAuthFailurePolicy({
    isFresh: (token) => token === FRESH,
    isDefinitiveFailure: (err) => err?.definitive === true,
    now: () => t,
    ...overrides,
  });
  return { policy, advance: (ms) => { t += ms; } };
}

test('a 401 with a still-fresh token never signs out (valid token rejected — config fault)', () => {
  const { policy } = makePolicy();
  for (let i = 0; i < 10; i += 1) {
    expect(policy.shouldSignOut({ idToken: FRESH })).toBe(false);
  }
});

test('one stale-token 401 is tolerated; the second inside the window signs out', () => {
  const { policy, advance } = makePolicy();
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
  advance(5_000);
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(true);
});

test('strikes expire outside the sliding window', () => {
  const { policy, advance } = makePolicy();
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
  advance(121_000); // beyond AUTH_FAILURE_WINDOW_MS
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
});

test('a TRANSIENT renew failure never counts — even a burst of 401s keeps the session', () => {
  const { policy, advance } = makePolicy();
  policy.noteRefreshFailure({ definitive: false }); // bridge 5xx / network blip
  // A poll burst at token expiry: every request 401s within seconds.
  for (let i = 0; i < 10; i += 1) {
    expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
    advance(1_000);
  }
});

test('a DEFINITIVE renew failure (invalid_grant) counts and signs out at the threshold', () => {
  const { policy, advance } = makePolicy();
  policy.noteRefreshFailure({ definitive: true }); // refresh token revoked/expired
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
  advance(3_000);
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(true);
});

test('a successful refresh clears a prior transient failure record', () => {
  const { policy, advance } = makePolicy();
  policy.noteRefreshFailure({ definitive: false });
  policy.noteRefreshSuccess();
  // With no failure record, stale-token 401s fall back to plain threshold
  // counting (e.g. no refresh token at all — nothing to renew with).
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
  advance(2_000);
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(true);
});

test('a later definitive failure overrides an earlier transient one', () => {
  const { policy, advance } = makePolicy();
  policy.noteRefreshFailure({ definitive: false });
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false); // suppressed
  advance(2_000);
  policy.noteRefreshFailure({ definitive: true });
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false); // first countable strike
  advance(2_000);
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(true);
});

test('missing token counts like a stale one (no session material at all)', () => {
  const { policy, advance } = makePolicy();
  expect(policy.shouldSignOut({ idToken: null })).toBe(false);
  advance(1_000);
  expect(policy.shouldSignOut({ idToken: null })).toBe(true);
});

test('reset clears both strikes and the failure record (sign-in / sign-out)', () => {
  const { policy, advance } = makePolicy();
  policy.noteRefreshFailure({ definitive: true });
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
  policy.reset();
  advance(1_000);
  // Post-reset: back to a clean slate — first 401 tolerated again.
  expect(policy.shouldSignOut({ idToken: STALE })).toBe(false);
});
