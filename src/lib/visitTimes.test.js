import { describe, expect, test } from 'vitest';
import { visitEndTime, visitStartTime } from './visitTimes.js';

describe('visitStartTime', () => {
  test('prefers scheduled_start, falls back to created_at', () => {
    expect(visitStartTime({ scheduled_start: 'S', created_at: 'C' })).toBe('S');
    expect(visitStartTime({ created_at: 'C' })).toBe('C');
    expect(visitStartTime(undefined)).toBe(null);
  });
});

describe('visitEndTime', () => {
  test('prefers scheduled_end', () => {
    expect(visitEndTime({ scheduled_end: 'E', status: 'active' })).toBe('E');
  });
  test('terminal visit without scheduled_end falls back to updated_at (checkout stamp)', () => {
    expect(visitEndTime({ status: 'completed', updated_at: 'U' })).toBe('U');
    expect(visitEndTime({ status: 'cancelled', updated_at: 'U' })).toBe('U');
  });
  test('live visit has no end', () => {
    expect(visitEndTime({ status: 'active', updated_at: 'U' })).toBe(null);
    expect(visitEndTime({ status: 'checking_in', updated_at: 'U' })).toBe(null);
  });
});
