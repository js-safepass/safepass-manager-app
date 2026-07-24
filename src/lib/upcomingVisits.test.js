import { describe, expect, test } from 'vitest';
import {
  groupUpcomingVisits,
  scheduledStartMs,
  sortByScheduledStart,
  upcomingBucket,
} from './upcomingVisits.js';

// Fixed "now" at local noon so day-boundary math is deterministic regardless
// of the machine's timezone (local-day grouping is the contract).
const NOW = new Date(2026, 6, 24, 12, 0, 0).getTime();
const at = (hoursFromNow) => new Date(NOW + hoursFromNow * 3600_000).toISOString();
const visit = (id, hoursFromNow) => ({
  id,
  status: 'pending',
  start_time: hoursFromNow === null ? undefined : at(hoursFromNow),
});

describe('scheduledStartMs', () => {
  test('parses start_time and rejects garbage/missing values', () => {
    expect(scheduledStartMs(visit('a', 2))).toBe(NOW + 2 * 3600_000);
    expect(scheduledStartMs(visit('a', null))).toBe(null);
    expect(scheduledStartMs({ start_time: 'not-a-date' })).toBe(null);
    expect(scheduledStartMs(undefined)).toBe(null);
  });

  test('never falls back to check_in_requested_at (creation ≠ arrival)', () => {
    expect(scheduledStartMs({ check_in_requested_at: at(-1) })).toBe(null);
  });
});

describe('sortByScheduledStart', () => {
  test('sorts soonest first with unscheduled visits last', () => {
    const rows = [visit('c', 5), visit('b', null), visit('a', 1)];
    expect(sortByScheduledStart(rows).map((v) => v.id)).toEqual(['a', 'c', 'b']);
  });

  test('breaks ties by id for a stable order across polls', () => {
    const rows = [visit('b', 2), visit('a', 2)];
    expect(sortByScheduledStart(rows).map((v) => v.id)).toEqual(['a', 'b']);
    const unscheduled = [visit('y', null), visit('x', null)];
    expect(sortByScheduledStart(unscheduled).map((v) => v.id)).toEqual(['x', 'y']);
  });

  test('does not mutate the input array', () => {
    const rows = [visit('b', 2), visit('a', 1)];
    sortByScheduledStart(rows);
    expect(rows.map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('upcomingBucket', () => {
  test('past start is overdue, even if earlier the same day', () => {
    expect(upcomingBucket(visit('a', -1), NOW)).toBe('overdue');
    expect(upcomingBucket(visit('a', -30), NOW)).toBe('overdue');
  });

  test('later the same local day is today; other days are later', () => {
    expect(upcomingBucket(visit('a', 3), NOW)).toBe('today');
    // 13h from local noon crosses local midnight → tomorrow.
    expect(upcomingBucket(visit('a', 13), NOW)).toBe('later');
    expect(upcomingBucket(visit('a', 48), NOW)).toBe('later');
  });

  test('unscheduled visits are later', () => {
    expect(upcomingBucket(visit('a', null), NOW)).toBe('later');
  });
});

describe('groupUpcomingVisits', () => {
  test('returns only non-empty groups in Overdue → Today → Later order', () => {
    const rows = [visit('tomorrow', 26), visit('soon', 1), visit('missed', -2)];
    const groups = groupUpcomingVisits(rows, NOW);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'later']);
    expect(groups.map((g) => g.visits.map((v) => v.id))).toEqual([
      ['missed'], ['soon'], ['tomorrow'],
    ]);
  });

  test('omits empty groups entirely', () => {
    const groups = groupUpcomingVisits([visit('soon', 2)], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'today', label: 'Today' });
  });

  test('sorts within each group and handles an empty list', () => {
    const rows = [visit('b', 4), visit('a', 2), visit('z', null)];
    const groups = groupUpcomingVisits(rows, NOW);
    expect(groups.find((g) => g.key === 'today').visits.map((v) => v.id)).toEqual(['a', 'b']);
    expect(groups.find((g) => g.key === 'later').visits.map((v) => v.id)).toEqual(['z']);
    expect(groupUpcomingVisits([], NOW)).toEqual([]);
    expect(groupUpcomingVisits(undefined, NOW)).toEqual([]);
  });
});
