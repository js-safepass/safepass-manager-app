import { expect, test } from 'vitest';
import { decodeJwtPayload, getJwtExpiryMs, getJwtSub, isJwtFresh } from './jwtUtil.js';

function makeJwt(payload) {
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none' })}.${enc(payload)}.sig`;
}

test('decodeJwtPayload / getJwtSub extract claims and null on garbage', () => {
  const token = makeJwt({ sub: 'user_123', exp: 1_800_000_000 });
  expect(decodeJwtPayload(token)?.sub).toBe('user_123');
  expect(getJwtSub(token)).toBe('user_123');
  expect(getJwtSub('not-a-jwt')).toBeNull();
  expect(getJwtSub(null)).toBeNull();
});

test('getJwtExpiryMs converts exp seconds to ms, null when absent', () => {
  expect(getJwtExpiryMs(makeJwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  expect(getJwtExpiryMs(makeJwt({ sub: 'x' }))).toBeNull();
  expect(getJwtExpiryMs('garbage')).toBeNull();
});

test('isJwtFresh honors the skew window', () => {
  const now = 1_000_000_000_000;
  const expIn60s = makeJwt({ exp: (now + 60_000) / 1000 });
  const expIn10s = makeJwt({ exp: (now + 10_000) / 1000 });
  const expired = makeJwt({ exp: (now - 1000) / 1000 });

  expect(isJwtFresh(expIn60s, { now })).toBe(true);
  // Inside the 30s skew — treat as stale so a refresh happens early.
  expect(isJwtFresh(expIn10s, { now })).toBe(false);
  expect(isJwtFresh(expired, { now })).toBe(false);
});

test('tokens without exp are treated as fresh (dev placeholders)', () => {
  expect(isJwtFresh('dev')).toBe(true);
  expect(isJwtFresh(makeJwt({ sub: 'x' }))).toBe(true);
});
