// Pure logic for the Schedule-visit form (plan step 3): datetime-local
// plumbing + client-side schedule validation.
//
// Wire truth (2026-07-24): POST /v1/visits accepts any start_time — even in
// the past — and only enforces end > start (and end requires start). The
// UI is deliberately stricter: a front desk scheduling a visit means a
// FUTURE arrival, so start must not be in the past (small grace so "right
// now" doesn't bounce). Mirror the server's end > start rule client-side so
// the error is instant instead of a 400 SCHEDULE_INVALID round-trip.
//
// Pure and unit-tested; ScheduleVisitModal is the wiring.

/** Small allowance so "schedule for right now" survives form-filling time. */
export const START_GRACE_MS = 5 * 60_000;

const pad = (n) => String(n).padStart(2, '0');

/** Epoch ms → the local-time string a datetime-local input wants
 *  (YYYY-MM-DDTHH:MM). */
export function toDatetimeLocalValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO 8601 UTC string, or null when empty or
 *  unparseable (the Date constructor treats the value as local time). */
export function fromDatetimeLocalValue(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Default prefill: one hour out, rounded UP to the next 5-minute step
 *  (legacy app's picker stepping). */
export function defaultStartValue(nowMs = Date.now()) {
  const STEP = 5 * 60_000;
  const target = Math.ceil((nowMs + 3600_000) / STEP) * STEP;
  return toDatetimeLocalValue(target);
}

/** The start input's `min`, floored to the 5-minute grid. The step base for
 *  datetime-local is the min itself — a raw "now" min puts every round clock
 *  time off-grid and the browser silently blocks submit on step mismatch
 *  (caught in headless verification 2026-07-24). Flooring keeps :00/:05/…
 *  valid; validateSchedule's grace window covers the ≤5-min past drift. */
export function minStartValue(nowMs = Date.now()) {
  const STEP = 5 * 60_000;
  return toDatetimeLocalValue(Math.floor(nowMs / STEP) * STEP);
}

/**
 * Validate the form's schedule fields (datetime-local strings).
 * Returns a user-facing error string, or null when valid.
 */
export function validateSchedule({ start, end, nowMs = Date.now() }) {
  if (!start) return 'Pick a start date and time.';
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return 'The start date and time could not be read.';
  if (startMs < nowMs - START_GRACE_MS) return 'The start time is in the past.';
  if (end) {
    const endMs = new Date(end).getTime();
    if (Number.isNaN(endMs)) return 'The end date and time could not be read.';
    if (endMs <= startMs) return 'The end time must be after the start time.';
  }
  return null;
}
