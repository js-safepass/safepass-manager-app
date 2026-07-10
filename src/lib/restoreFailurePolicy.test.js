// Coverage for classifyRestoreFailure — the decision function that
// determines whether a restore-validate failure should wipe the
// Keychain (auth-permanent) or preserve it (transient / abort).
//
// The full matrix matters here because the wrong call has real cost:
//   - Misclassifying a transient error as 'wipe' loses the kiosk's
//     persisted session on a brief wifi outage, forcing fresh Setup.
//   - Misclassifying a permanent error as 'preserve' leaves the kiosk
//     stuck on the restore overlay with a session the server has
//     already invalidated.

import { describe, expect, test } from 'vitest';
import { KioskApiError } from './kioskApi.js';
import { classifyRestoreFailure } from './restoreFailurePolicy.js';

describe('classifyRestoreFailure', () => {
  test('AbortError → abort', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyRestoreFailure(err)).toBe('abort');
  });

  test('DOMException-style AbortError → abort', () => {
    // Browser fetch + AbortSignal.timeout() throws a DOMException with
    // name='AbortError'. The classifier must recognize both Error and
    // DOMException variants.
    const err = new DOMException('aborted', 'AbortError');
    expect(classifyRestoreFailure(err)).toBe('abort');
  });

  test('401 KIOSK_SESSION_REVOKED → wipe', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('revoked', { status: 401, code: 'KIOSK_SESSION_REVOKED' }),
    )).toBe('wipe');
  });

  test('401 KIOSK_SESSION_EXPIRED → wipe', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('expired', { status: 401, code: 'KIOSK_SESSION_EXPIRED' }),
    )).toBe('wipe');
  });

  test('403 → wipe', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('forbidden', { status: 403 }),
    )).toBe('wipe');
  });

  test('404 → wipe', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('not found', { status: 404 }),
    )).toBe('wipe');
  });

  test('500 → preserve (server hiccup, persisted creds likely still valid)', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('upstream error', { status: 500 }),
    )).toBe('preserve');
  });

  test('503 Service Unavailable → preserve', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('unavailable', { status: 503 }),
    )).toBe('preserve');
  });

  test('429 KIOSK_REFRESH_TOO_SOON → preserve', () => {
    expect(classifyRestoreFailure(
      new KioskApiError('too soon', { status: 429, code: 'KIOSK_REFRESH_TOO_SOON' }),
    )).toBe('preserve');
  });

  test('plain network failure (TypeError, not a KioskApiError) → preserve', () => {
    // This is the cold-start-during-wifi-outage case: fetch rejects with
    // a TypeError before any HTTP response. MUST not wipe the Keychain.
    const err = new TypeError('Failed to fetch');
    expect(classifyRestoreFailure(err)).toBe('preserve');
  });

  test('null / undefined errors → preserve', () => {
    // Defensive: a thrown null shouldn't take the wipe path. Preserve
    // is the safer default when classification is uncertain.
    expect(classifyRestoreFailure(null)).toBe('preserve');
    expect(classifyRestoreFailure(undefined)).toBe('preserve');
  });

  test('unknown 4xx KioskApiError → wipe (treated as terminal)', () => {
    // Matches isPermanentKioskError's existing classification: any 4xx
    // that isn't on the explicit transient list is terminal.
    expect(classifyRestoreFailure(
      new KioskApiError('teapot', { status: 418, code: 'SOMETHING_ODD' }),
    )).toBe('wipe');
  });
});
