import { describe, expect, test } from 'vitest';
import { AUTH_ACTION, isMfaAction, resolveAuthAction } from './authActions.js';

describe('resolveAuthAction', () => {
  test('MFA_REAUTH_REQUIRED -> reauth (session predates enrollment)', () => {
    expect(resolveAuthAction('MFA_REAUTH_REQUIRED')).toBe(AUTH_ACTION.REAUTH);
  });

  test('ID_TOKEN_REQUIRED -> reauth (bearer/config fault; re-login is the safe response)', () => {
    expect(resolveAuthAction('ID_TOKEN_REQUIRED')).toBe(AUTH_ACTION.REAUTH);
  });

  test('MFA_REQUIRED -> enroll notice (no enroll UI in this app)', () => {
    expect(resolveAuthAction('MFA_REQUIRED')).toBe(AUTH_ACTION.MFA_ENROLL);
  });

  test('MFA_TOTP_REQUIRED -> authenticator notice', () => {
    expect(resolveAuthAction('MFA_TOTP_REQUIRED')).toBe(AUTH_ACTION.MFA_TOTP);
  });

  test('USER_ACCOUNT_INACTIVE -> terminal', () => {
    expect(resolveAuthAction('USER_ACCOUNT_INACTIVE')).toBe(AUTH_ACTION.TERMINAL);
  });

  test('unknown / plain UNAUTHORIZED / undefined -> expiry (threshold-gated recovery)', () => {
    expect(resolveAuthAction('UNAUTHORIZED')).toBe(AUTH_ACTION.EXPIRY);
    expect(resolveAuthAction('SOMETHING_ELSE')).toBe(AUTH_ACTION.EXPIRY);
    expect(resolveAuthAction(undefined)).toBe(AUTH_ACTION.EXPIRY);
  });

  test('isMfaAction flags only the gated-but-authenticated actions', () => {
    expect(isMfaAction(AUTH_ACTION.MFA_ENROLL)).toBe(true);
    expect(isMfaAction(AUTH_ACTION.MFA_TOTP)).toBe(true);
    expect(isMfaAction(AUTH_ACTION.REAUTH)).toBe(false);
    expect(isMfaAction(AUTH_ACTION.TERMINAL)).toBe(false);
    expect(isMfaAction(AUTH_ACTION.EXPIRY)).toBe(false);
  });
});
