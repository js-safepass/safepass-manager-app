// Badge-pipeline status, derived from the visit's badge media/error fields —
// the same derivation sentinel-ui's useVisitFlow uses (media ids + error
// fields are the truth; there is no status enum for the pipeline itself).
//
// Pure and unit-tested; pages/visits/VisitsList.jsx is the wiring.

export function badgeStatus(v) {
  if (v?.badge_encode_error || v?.badge_render_error) return 'failed';
  if (v?.badge_encoded_media_id) return 'encoded_ready';
  if (v?.badge_raw_media_id) return 'rendered';
  return 'pending';
}

// Poll-transition detector: the badge pipeline completes in the BACKGROUND
// (checking_in → active → encoded over ~seconds, observed via the 15s list
// poll), so "the badge is ready" is a state TRANSITION between polls, not an
// action callback. Given the previous poll's statuses (a Map of visit id →
// badgeStatus) and the current visits, return the ids that just became
// encoded_ready. Ids absent from prevStatuses are NOT reported — the first
// page load must not read as "N badges just completed".
export function newlyEncodedReady(prevStatuses, visits) {
  const ready = [];
  for (const v of visits || []) {
    const prev = prevStatuses.get(v.id);
    if (prev !== undefined && prev !== 'encoded_ready' && badgeStatus(v) === 'encoded_ready') {
      ready.push(v.id);
    }
  }
  return ready;
}

// Snapshot helper for the caller's ref.
export function badgeStatusMap(visits) {
  return new Map((visits || []).map((v) => [v.id, badgeStatus(v)]));
}
