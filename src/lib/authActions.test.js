import { describe, expect, test } from 'vitest';
import { AUTH_ACTION, resolveAuthAction } from './authActions.js';

describe('resolveAuthAction', () => {
  test('ID_TOKEN_REQUIRED -> reauth (bearer/config fault; re-login is the safe response)', () => {
    expect(resolveAuthAction('ID_TOKEN_REQUIRED')).toBe(AUTH_ACTION.REAUTH);
  });

  test('USER_ACCOUNT_INACTIVE -> terminal', () => {
    expect(resolveAuthAction('USER_ACCOUNT_INACTIVE')).toBe(AUTH_ACTION.TERMINAL);
  });

  test('unknown / plain UNAUTHORIZED / undefined -> expiry (threshold-gated recovery)', () => {
    expect(resolveAuthAction('UNAUTHORIZED')).toBe(AUTH_ACTION.EXPIRY);
    expect(resolveAuthAction('SOMETHING_ELSE')).toBe(AUTH_ACTION.EXPIRY);
    expect(resolveAuthAction(undefined)).toBe(AUTH_ACTION.EXPIRY);
  });
});
