// Visitor LIVE presence, derived from on-site visits (owner feedback
// 2026-07-23). The Visitor record has no live-state field and /visitors has
// no presence filter (verified against the API spec) — a visitor's
// "checked in / checking in" state exists only as their current visit's
// status. The visitors screen fetches on-site visits
// (status=checking_in,active,checking_out) and joins client-side.
//
// Lifecycle `status` (active/pending_review/archived) is a RECORD state, not
// presence — the screens demote it to a secondary badge.
//
// Pure and unit-tested; pages/visitors/VisitorsList.jsx is the wiring.

// Map visitor_id -> on-site visit status. Later visits win (a visitor should
// only have one open visit, but the join must not depend on that).
export function presenceFromVisits(visits) {
  const map = new Map();
  for (const v of visits || []) {
    if (v?.visitor_id) map.set(v.visitor_id, v.status);
  }
  return map;
}

// Display contract for the presence chip. Null = not on site (render muted).
const PRESENCE = {
  checking_in: { label: 'Checking in', variant: 'info' },
  active: { label: 'On site', variant: 'success' },
  checking_out: { label: 'Checking out', variant: 'warning' },
};

export function presenceFor(presenceMap, visitorId) {
  return PRESENCE[presenceMap?.get?.(visitorId)] || null;
}
