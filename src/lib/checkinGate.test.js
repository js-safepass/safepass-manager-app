import { describe, expect, test } from 'vitest';
import { isCheckinGateError } from './checkinGate.js';

describe('isCheckinGateError', () => {
  test('flags every brief-§4 gate code', () => {
    for (const code of [
      'REVIEW_REQUIRED',
      'BACKGROUND_CHECK_REQUIRED',
      'VISITOR_ALREADY_CHECKED_IN',
      'VISITOR_CHECKIN_IN_PROGRESS',
      'NO_AVAILABLE_BADGES',
      'CHECKIN_QUEUE_FULL',
      'CHECKIN_UNAVAILABLE',
      'BUILDING_REQUIRED',
    ]) {
      expect(isCheckinGateError({ code })).toBe(true);
    }
  });

  test('real errors and unknowns are not gates', () => {
    expect(isCheckinGateError({ code: 'UNAUTHORIZED' })).toBe(false);
    expect(isCheckinGateError({ code: 'NETWORK_ERROR' })).toBe(false);
    expect(isCheckinGateError(new Error('boom'))).toBe(false);
    expect(isCheckinGateError(undefined)).toBe(false);
  });
});
