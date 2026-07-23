// Coverage for getUserFacingError — the single mapper from backend errors to
// staff-facing text. The load-bearing invariants:
//
//   - Stable RFC7807 codes map to their catalogue message.
//   - 401/403/429/5xx status fallbacks behave when the code is unmapped.
//   - Raw technical/sensitive server text never reaches the user
//     (sanitizeMessage filters URLs, SCREAMING_CODES, and resource ids).

import { describe, expect, test } from 'vitest';
import { getUserFacingError } from './userErrors.js';

describe('getUserFacingError — code catalogue', () => {
  test.each([
    ['REVIEW_REQUIRED', /needs review/i],
    ['BACKGROUND_CHECK_REQUIRED', /background check/i],
    ['VISITOR_ALREADY_CHECKED_IN', /already checked in/i],
    ['NO_AVAILABLE_BADGES', /no badges/i],
    ['CHECKIN_QUEUE_FULL', /busy right now/i],
    ['FACE_INDEX_NO_FACE', /no face was detected/i],
    ['UNAUTHORIZED', /sign in again/i],
    ['FORBIDDEN', /do not have access/i],
  ])('code %s maps to catalogue text', (code, expected) => {
    expect(getUserFacingError({ code, status: 400 })).toMatch(expected);
  });

  test('unknown code falls back by status: 401', () => {
    expect(getUserFacingError({ code: 'SOMETHING_NEW', status: 401 })).toMatch(/sign in again/i);
  });

  test('unknown code falls back by status: 403', () => {
    expect(getUserFacingError({ code: 'SOMETHING_NEW', status: 403 })).toMatch(/do not have access/i);
  });

  test('unknown code falls back by status: 429', () => {
    expect(getUserFacingError({ code: 'SOMETHING_NEW', status: 429 })).toMatch(/wait a moment/i);
  });

  test('unknown code with 5xx uses the context fallback', () => {
    expect(getUserFacingError({ code: 'SOMETHING_NEW', status: 503 }, 'checkin')).toMatch(
      /check-in could not be completed/i,
    );
  });
});

describe('getUserFacingError — sanitization', () => {
  test('technical server detail is suppressed in favor of the fallback', () => {
    expect(
      getUserFacingError({ status: 400, message: 'POST /v1/visitors failed: {"field":"email"}' }, 'save'),
    ).toMatch(/changes could not be saved/i);
  });

  test('messages containing resource ids are suppressed', () => {
    expect(
      getUserFacingError({ status: 400, message: 'visitor_01H9ABCDEF not eligible' }, 'checkin'),
    ).toMatch(/check-in could not be completed/i);
  });

  test('clean human-readable server detail passes through', () => {
    expect(
      getUserFacingError({ status: 400, message: 'Email address is not valid.' }),
    ).toBe('Email address is not valid.');
  });
});

describe('getUserFacingError — transport and edge cases', () => {
  test('TypeError (fetch network failure) maps to the network message', () => {
    expect(getUserFacingError(new TypeError('Failed to fetch'))).toMatch(/could not connect/i);
  });

  test('string network error maps to the network message', () => {
    expect(getUserFacingError('NetworkError when attempting to fetch resource.')).toMatch(
      /could not connect/i,
    );
  });

  test('OAuth access_denied reads as cancelled sign-in', () => {
    expect(getUserFacingError('access_denied', 'signIn')).toMatch(/cancelled/i);
  });

  test('null / undefined fall back to the general message', () => {
    expect(getUserFacingError(null)).toMatch(/something went wrong/i);
    expect(getUserFacingError(undefined)).toMatch(/something went wrong/i);
  });
});
