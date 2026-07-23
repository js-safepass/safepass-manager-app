import { describe, expect, test } from 'vitest';
import { badgeStatus, badgeStatusMap, newlyEncodedReady } from './badgePipeline.js';

const visit = (id, over = {}) => ({
  id,
  badge_raw_media_id: null,
  badge_encoded_media_id: null,
  badge_render_error: null,
  badge_encode_error: null,
  ...over,
});

describe('badgeStatus', () => {
  test('derives the pipeline stage from media/error fields', () => {
    expect(badgeStatus(visit('v'))).toBe('pending');
    expect(badgeStatus(visit('v', { badge_raw_media_id: 'm' }))).toBe('rendered');
    expect(badgeStatus(visit('v', { badge_raw_media_id: 'm', badge_encoded_media_id: 'e' }))).toBe('encoded_ready');
    expect(badgeStatus(visit('v', { badge_render_error: 'boom' }))).toBe('failed');
    expect(badgeStatus(visit('v', { badge_encoded_media_id: 'e', badge_encode_error: 'late fail' }))).toBe('failed');
  });
});

describe('newlyEncodedReady', () => {
  test('reports only transitions INTO encoded_ready between polls', () => {
    const prev = badgeStatusMap([visit('a', { badge_raw_media_id: 'm' }), visit('b')]);
    const now = [
      visit('a', { badge_raw_media_id: 'm', badge_encoded_media_id: 'e' }), // rendered -> ready
      visit('b'), // still pending
    ];
    expect(newlyEncodedReady(prev, now)).toEqual(['a']);
  });

  test('already-ready visits do not re-report', () => {
    const ready = visit('a', { badge_encoded_media_id: 'e' });
    const prev = badgeStatusMap([ready]);
    expect(newlyEncodedReady(prev, [ready])).toEqual([]);
  });

  test('first sighting (no previous entry) is NOT a completion — initial page load stays silent', () => {
    const now = [visit('new', { badge_encoded_media_id: 'e' })];
    expect(newlyEncodedReady(new Map(), now)).toEqual([]);
  });

  test('tolerates empty/absent lists', () => {
    expect(newlyEncodedReady(new Map(), [])).toEqual([]);
    expect(newlyEncodedReady(new Map(), undefined)).toEqual([]);
  });
});
