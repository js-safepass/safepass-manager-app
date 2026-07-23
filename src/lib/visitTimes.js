// Start/End timestamps for displaying a visit's lifespan (owner decision
// 2026-07-23: the visits list shows Visitor | Status | Start | End).
//
// Start: scheduled_start when present; desk check-ins create the visit at
// check-in time, so created_at is the faithful fallback.
// End: scheduled_end when present; a TERMINAL visit without one (the normal
// desk flow — checkout/complete/cancel stamps no scheduled_end) falls back to
// updated_at, which the lifecycle action wrote at transition time. A live
// visit has no end yet → null.
//
// Pure and unit-tested; VisitsList/VisitActionModal are the wiring.

import { isTerminalVisit } from './visitHelpers.js';

export function visitStartTime(v) {
  return v?.scheduled_start || v?.created_at || null;
}

export function visitEndTime(v) {
  if (v?.scheduled_end) return v.scheduled_end;
  if (v && isTerminalVisit(v)) return v.updated_at || null;
  return null;
}
