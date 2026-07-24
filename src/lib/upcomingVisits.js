// Ordering + day-grouping for the Visits tab "Upcoming" view (pending
// scheduled visits a front desk is working today).
//
// Why this lives client-side (wire truth validated against sentinel-datamanager
// 2026-07-24, see docs/scheduled-visits-plan.md): GET /v1/visits has NO
// time-window filters and scheduled_start is NOT in the server's sort-column
// whitelist — the server can only hand back pending visits in -created_at
// order. So "soonest first" and the Overdue/Today/Later split happen here.
//
// Group boundaries use the DEVICE's local day, matching how every timestamp
// on the screen is rendered (formatDateTime with no explicit tz). The
// backend's expiry worker uses the LOCATION's day (+2h grace) instead — near
// midnight the two can disagree briefly; Overdue exists precisely so a
// stale-but-unexpired pending visit stays visible rather than hidden.
//
// Pure and unit-tested; VisitsList is the wiring.

/** Scheduled start of a pending visit in epoch ms, or null when unscheduled
 *  (start_time is dto.VisitOut's scheduled_start — do not fall back to
 *  check_in_requested_at here: creation time is not an arrival time). */
export function scheduledStartMs(visit) {
  if (!visit?.start_time) return null;
  const ms = new Date(visit.start_time).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Soonest first; unscheduled (null start_time) sink to the end; id ties for
 *  a stable order across polls. Returns a new array. */
export function sortByScheduledStart(visits) {
  return [...(visits || [])].sort((a, b) => {
    const sa = scheduledStartMs(a);
    const sb = scheduledStartMs(b);
    if (sa === null && sb === null) return String(a?.id).localeCompare(String(b?.id));
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sa !== sb) return sa - sb;
    return String(a?.id).localeCompare(String(b?.id));
  });
}

function sameLocalDay(ms, nowMs) {
  const a = new Date(ms);
  const b = new Date(nowMs);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

const GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'later', label: 'Later' },
];

/** Bucket one visit relative to now: scheduled start already passed →
 *  'overdue'; starts later today → 'today'; future days or no start_time →
 *  'later'. */
export function upcomingBucket(visit, nowMs = Date.now()) {
  const start = scheduledStartMs(visit);
  if (start === null) return 'later';
  if (start < nowMs) return 'overdue';
  return sameLocalDay(start, nowMs) ? 'today' : 'later';
}

/**
 * Sort + group pending visits for the Upcoming view.
 * Returns only non-empty groups, in Overdue → Today → Later order, each
 * `{ key, label, visits }` with visits soonest-first (unscheduled last).
 */
export function groupUpcomingVisits(visits, nowMs = Date.now()) {
  const sorted = sortByScheduledStart(visits);
  return GROUPS
    .map(({ key, label }) => ({
      key,
      label,
      visits: sorted.filter((v) => upcomingBucket(v, nowMs) === key),
    }))
    .filter((g) => g.visits.length > 0);
}
