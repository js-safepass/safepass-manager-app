/**
 * Centralized status-to-Bootstrap-variant mapping.
 *
 * This is the single source of truth for status badge colors across the app.
 * See docs/standards/ui-ux.md for the color semantics.
 *
 * Color map:
 *   success  (green)  — positive/current: active, checked_in, confirmed, approved, online, merged
 *   primary  (blue)   — finished normally: completed, checked_out
 *   warning  (yellow) — awaiting action:  pending, scheduled, suspended, draft, for_review, disabled
 *   danger   (red)    — negative/terminal: cancelled, failed, blocked, rejected, breach, revoked, error
 *   info     (ltblue) — transitional:     visiting, checking_in, checking_out
 *   secondary (gray)  — neutral/default:  inactive, archived, unknown, offline, unassigned
 */

const STATUS_MAP = {
  // positive / current
  active: 'success',
  available: 'success',
  approved: 'success',
  checked_in: 'success',
  confirmed: 'success',
  online: 'success',
  merged: 'success',
  assigned: 'success',
  connected: 'success',

  // finished normally
  completed: 'primary',
  checked_out: 'primary',

  // awaiting action
  pending: 'warning',
  scheduled: 'warning',
  suspended: 'warning',
  draft: 'warning',
  for_review: 'warning',
  disabled: 'warning',
  open: 'warning',

  // transitional
  visiting: 'info',
  checking_in: 'info',
  checking_out: 'info',

  // negative / terminal
  cancelled: 'danger',
  failed: 'danger',
  blocked: 'danger',
  rejected: 'danger',
  breach: 'danger',
  revoked: 'danger',
  error: 'danger',

  // neutral
  inactive: 'secondary',
  archived: 'secondary',
  unknown: 'secondary',
  offline: 'secondary',
  unassigned: 'secondary',
  dismissed: 'secondary',
  // expired = no-show terminal state (backend cleanup of un-checked-in
  // scheduled visits). Neutral gray rather than danger red: it's a quiet,
  // system-initiated close, not an operator-flagged failure like cancelled.
  expired: 'secondary',
};

/**
 * Return the Bootstrap badge variant for a given status string.
 * @param {string} status - The status value (case-insensitive)
 * @param {string} [fallback='secondary'] - Fallback variant if status is unrecognized
 * @returns {string} Bootstrap variant name
 */
export function statusVariant(status, fallback = 'secondary') {
  if (!status) return fallback;
  return STATUS_MAP[String(status).toLowerCase()] ?? fallback;
}

/**
 * Return the Bootstrap badge variant for audit log actions.
 * @param {string} action - The action string (case-insensitive)
 * @returns {string} Bootstrap variant name
 */
export function actionBadgeVariant(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('create') || a.includes('add')) return 'success';
  if (a.includes('delete') || a.includes('remove')) return 'danger';
  if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'warning';
  if (a.includes('login') || a.includes('auth')) return 'info';
  return 'secondary';
}
