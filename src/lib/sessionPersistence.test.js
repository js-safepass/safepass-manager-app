import { describe, expect, test } from 'vitest';
import { packStoredSession, unpackStoredSession } from './sessionPersistence.js';

describe('packStoredSession', () => {
  test('round-trips a refresh token with version + timestamp', () => {
    const raw = packStoredSession('rt-123', 1700000000000);
    expect(unpackStoredSession(raw)).toEqual({ refreshToken: 'rt-123', storedAt: 1700000000000 });
  });

  test('nothing to persist -> null (no refresh token, e.g. dev sign-in)', () => {
    expect(packStoredSession(null, 1)).toBe(null);
    expect(packStoredSession('', 1)).toBe(null);
    expect(packStoredSession(undefined, 1)).toBe(null);
  });
});

describe('unpackStoredSession — corrupt data degrades to "nothing stored"', () => {
  test('null / empty / non-string', () => {
    expect(unpackStoredSession(null)).toBe(null);
    expect(unpackStoredSession('')).toBe(null);
    expect(unpackStoredSession(42)).toBe(null);
  });

  test('malformed JSON', () => {
    expect(unpackStoredSession('{not json')).toBe(null);
  });

  test('unknown version is not trusted', () => {
    expect(unpackStoredSession(JSON.stringify({ v: 2, refreshToken: 'rt' }))).toBe(null);
    expect(unpackStoredSession(JSON.stringify({ refreshToken: 'rt' }))).toBe(null);
  });

  test('missing/empty refresh token', () => {
    expect(unpackStoredSession(JSON.stringify({ v: 1 }))).toBe(null);
    expect(unpackStoredSession(JSON.stringify({ v: 1, refreshToken: '' }))).toBe(null);
  });
});
