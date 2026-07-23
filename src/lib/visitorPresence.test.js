import { describe, expect, test } from 'vitest';
import { presenceFor, presenceFromVisits } from './visitorPresence.js';

describe('visitor presence join', () => {
  const visits = [
    { visitor_id: 'a', status: 'active' },
    { visitor_id: 'b', status: 'checking_in' },
    { visitor_id: 'c', status: 'checking_out' },
  ];

  test('maps on-site visit statuses to their visitors', () => {
    const map = presenceFromVisits(visits);
    expect(presenceFor(map, 'a')).toEqual({ label: 'On site', variant: 'success' });
    expect(presenceFor(map, 'b')).toEqual({ label: 'Checking in', variant: 'info' });
    expect(presenceFor(map, 'c')).toEqual({ label: 'Checking out', variant: 'warning' });
  });

  test('unknown visitor / empty inputs -> null (off site)', () => {
    const map = presenceFromVisits(visits);
    expect(presenceFor(map, 'zzz')).toBe(null);
    expect(presenceFor(presenceFromVisits([]), 'a')).toBe(null);
    expect(presenceFor(presenceFromVisits(undefined), 'a')).toBe(null);
  });

  test('an unexpected visit status never crashes the chip', () => {
    const map = presenceFromVisits([{ visitor_id: 'x', status: 'completed' }]);
    expect(presenceFor(map, 'x')).toBe(null);
  });
});
