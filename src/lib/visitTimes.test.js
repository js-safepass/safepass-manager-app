import { describe, expect, test } from 'vitest';
import { visitEndTime, visitStartTime } from './visitTimes.js';

describe('visitStartTime', () => {
  test('prefers the actual check-in, then scheduled start, then the request stamp', () => {
    expect(visitStartTime({ checked_in_at: 'A', start_time: 'S', check_in_requested_at: 'R' })).toBe('A');
    expect(visitStartTime({ start_time: 'S', check_in_requested_at: 'R' })).toBe('S');
    expect(visitStartTime({ check_in_requested_at: 'R' })).toBe('R');
    expect(visitStartTime(undefined)).toBe(null);
  });
});

describe('visitEndTime', () => {
  test('prefers the actual checkout stamp regardless of status', () => {
    expect(visitEndTime({ checked_out_at: 'O', end_time: 'E', status: 'active' })).toBe('O');
    expect(visitEndTime({ checked_out_at: 'O', status: 'completed' })).toBe('O');
  });
  test('terminal visit without a checkout stamp falls back to scheduled end', () => {
    expect(visitEndTime({ status: 'completed', end_time: 'E' })).toBe('E');
    expect(visitEndTime({ status: 'cancelled' })).toBe(null);
  });
  test('live visit has no end even when a scheduled end exists', () => {
    expect(visitEndTime({ status: 'active', end_time: 'E' })).toBe(null);
    expect(visitEndTime({ status: 'checking_in', end_time: 'E' })).toBe(null);
  });
});
