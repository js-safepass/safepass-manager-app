// Coverage for classifyCheckinError — the function that routes a
// check-in failure code into one of five UX groups driving the
// failure-modal copy and the Retry-vs-StartOver button.
//
// Misclassifying here directly hurts visitor UX: a transient error
// mistakenly tagged 'unrecoverable' dead-ends the visitor; an
// unrecoverable error tagged 'transient' lets them retry into the
// same failure forever. The recent multi-faces relaxation (allowing
// FACE_INDEX_MULTIPLE_FACES to fall through to the transient/retry
// path instead of forcing 'startOver') is exercised explicitly.

import { describe, expect, test } from 'vitest';
import { classifyCheckinError } from './userErrors.js';

describe('classifyCheckinError — group routing', () => {
  test.each([
    ['VISITOR_ALREADY_CHECKED_IN', 'alreadyCheckedIn', 'startOver'],
    ['VISITOR_CHECKIN_IN_PROGRESS', 'alreadyCheckedIn', 'startOver'],
  ])('code %s → alreadyCheckedIn', (code, group, action) => {
    const classified = classifyCheckinError({ code });
    expect(classified.group).toBe(group);
    expect(classified.action).toBe(action);
    expect(classified.message).toMatch(/already checked in/i);
  });

  test.each([
    ['VISITOR_NOT_AVAILABLE', 'unrecoverable', 'startOver'],
    ['BUILDING_REQUIRED', 'unrecoverable', 'startOver'],
    ['VISITOR_NOT_FOUND', 'unrecoverable', 'startOver'],
    // VISITOR_ARCHIVED here covers the rare cases where runCheckinChain's
    // one-shot merge-retry exhausts (chained merge) or the response is
    // missing merged_into_visitor_id — the error propagates up and should
    // present as "see the front desk" rather than "try again".
    ['VISITOR_ARCHIVED', 'unrecoverable', 'startOver'],
  ])('code %s → unrecoverable', (code, group, action) => {
    const classified = classifyCheckinError({ code });
    expect(classified.group).toBe(group);
    expect(classified.action).toBe(action);
    expect(classified.message).toMatch(/unable to check you in/i);
  });

  test.each([
    ['CHECKIN_QUEUE_FULL', 'transient', 'retry'],
    ['NO_AVAILABLE_BADGES', 'transient', 'retry'],
    ['CHECKIN_UNAVAILABLE', 'transient', 'retry'],
  ])('code %s → transient (retry offered)', (code, group, action) => {
    const classified = classifyCheckinError({ code });
    expect(classified.group).toBe(group);
    expect(classified.action).toBe(action);
    expect(classified.message).toMatch(/try again/i);
  });

  test.each([
    ['REVIEW_REQUIRED', 'needsStaff', 'startOver'],
    ['BACKGROUND_CHECK_REQUIRED', 'needsStaff', 'startOver'],
  ])('code %s → needsStaff', (code, group, action) => {
    const classified = classifyCheckinError({ code });
    expect(classified.group).toBe(group);
    expect(classified.action).toBe(action);
    expect(classified.message).toMatch(/approval/i);
  });

  test('FACE_INDEX_NO_FACE → photo (startOver)', () => {
    const classified = classifyCheckinError({ code: 'FACE_INDEX_NO_FACE' });
    expect(classified.group).toBe('photo');
    expect(classified.action).toBe('startOver');
    expect(classified.message).toMatch(/retake your photo/i);
  });

  test('ORG_MISMATCH → orgMismatch (startOver)', () => {
    const classified = classifyCheckinError({ code: 'ORG_MISMATCH' });
    expect(classified.group).toBe('orgMismatch');
    expect(classified.action).toBe('startOver');
  });
});

describe('classifyCheckinError — multi-faces relaxation', () => {
  // The Photo step's multi-face block was relaxed: a check-in that
  // surfaces FACE_INDEX_MULTIPLE_FACES at the final step (server-side
  // face count check) should NOT dead-end the visitor with 'startOver'.
  // Instead it falls through to the transient/retry path so the visitor
  // can try again (and Close + back chevrons let them recapture if
  // needed). This test pins that behavior down.
  test('FACE_INDEX_MULTIPLE_FACES falls through to transient (retry, not startOver)', () => {
    const classified = classifyCheckinError({ code: 'FACE_INDEX_MULTIPLE_FACES' });
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });
});

describe('classifyCheckinError — fallback / edge cases', () => {
  test('unknown code → transient fallback', () => {
    const classified = classifyCheckinError({ code: 'SOMETHING_NEW' });
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });

  test('error without code → transient fallback', () => {
    // Network errors, 5xx without parsed body, etc. — visitor gets Retry.
    const classified = classifyCheckinError({ status: 500 });
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });

  test('null error → transient fallback', () => {
    const classified = classifyCheckinError(null);
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });

  test('undefined error → transient fallback', () => {
    const classified = classifyCheckinError(undefined);
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });

  test('string error (legacy) → transient fallback', () => {
    // Some catch sites still throw plain strings; classifier mustn't
    // crash and should default to giving the visitor a retry.
    const classified = classifyCheckinError('something went wrong');
    expect(classified.group).toBe('transient');
    expect(classified.action).toBe('retry');
  });
});
