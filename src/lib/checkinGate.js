// Check-in GATE failures vs real errors. A gate failure (the brief §4
// catalogue) is an expected business outcome — the visitor needs review, is
// already in, no badges left — and should read as a WARNING (fix the
// condition, retry), not a system error. Branch on the stable RFC7807 `code`
// (never detail), same rule as everywhere else.
//
// Pure and unit-tested; the check-in handler is the wiring.

const CHECKIN_GATE_CODES = new Set([
  'REVIEW_REQUIRED',
  'BACKGROUND_CHECK_REQUIRED',
  'VISITOR_ALREADY_CHECKED_IN',
  'VISITOR_CHECKIN_IN_PROGRESS',
  'NO_AVAILABLE_BADGES',
  'CHECKIN_QUEUE_FULL',
  'CHECKIN_UNAVAILABLE',
  'BUILDING_REQUIRED',
]);

export function isCheckinGateError(err) {
  return CHECKIN_GATE_CODES.has(err?.code);
}
