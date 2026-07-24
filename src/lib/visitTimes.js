// Start/End timestamps for displaying a visit's lifespan (owner decision
// 2026-07-23: the visits list shows Visitor | Status | Start | End).
//
// Field names are WIRE TRUTH from the backend's dto.VisitOut (verified against
// sentinel-datamanager 2026-07-24) — an earlier version read scheduled_start/
// created_at/updated_at, which do not exist on visits; the mock had invented
// them, so every real deployment rendered "—". Keep the mock in managerApi.js
// mirroring VisitOut so that can't recur.
//
// Start: the ACTUAL check-in when it happened, else the scheduled start_time,
// else check_in_requested_at (always present — desk check-ins stamp it at
// creation).
// End: the actual checked_out_at, else the scheduled end_time for a terminal
// visit (cancelled/expired visits stamp nothing → null → "—"). A live visit
// has no end yet → null.
//
// Pure and unit-tested; VisitsList/VisitActionModal/VisitorDetail are the
// wiring.

import { isTerminalVisit } from './visitHelpers.js';

export function visitStartTime(v) {
  return v?.checked_in_at || v?.start_time || v?.check_in_requested_at || null;
}

export function visitEndTime(v) {
  if (v?.checked_out_at) return v.checked_out_at;
  if (v && isTerminalVisit(v)) return v.end_time || null;
  return null;
}
