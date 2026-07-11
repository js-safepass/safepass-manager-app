// lib/visitHelpers.js — Shared visit/schedule utilities.
//
// Extracted from visitor.jsx and visitorView.jsx to eliminate duplication.
// Used by visitor list, visit detail, visit modals, and scheduled visit tables.

import { formatDateTime, formatTime } from './format/datetime';

/**
 * Safely parse a value into a Date. Returns null for invalid/missing values.
 */
export function parseDateSafe(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Extract the start/end times from a visit record, handling the many possible
 * field name variations from the API.
 *
 * @param {object} visit — raw visit record (or { _raw: record })
 * @param {string} [tz] — IANA timezone for formatting the range label
 * @returns {{ startDate: Date|null, endDate: Date|null, rangeLabel: string, startRaw: string, endRaw: string }}
 */
export function getVisitScheduleInfo(visit, tz) {
  const raw = visit?._raw || visit || {};
  const startRaw = raw._starts_normalized
    || raw.start_time
    || raw.starts_at
    || raw.start_at
    || raw.check_in_at
    || raw.check_in_requested_at
    || raw.checkin_requested_at
    || '';
  const endRaw = raw._ends_normalized
    || raw.end_time
    || raw.ends_at
    || raw.end_at
    || raw.check_out_at
    || raw.check_out_requested_at
    || raw.checkout_requested_at
    || '';
  const startDate = parseDateSafe(startRaw);
  const endDate = parseDateSafe(endRaw);
  const sameDay = startDate && endDate && startDate.toDateString() === endDate.toDateString();
  const rangeLabel = startDate
    ? (endDate
      ? (sameDay
        ? `${formatDateTime(startDate, tz)} – ${formatTime(endDate, tz)}`
        : `${formatDateTime(startDate, tz)} – ${formatDateTime(endDate, tz)}`)
      : formatDateTime(startDate, tz))
    : '—';
  return { startDate, endDate, rangeLabel, startRaw, endRaw };
}

/**
 * Classify a visit as 'today', 'upcoming', or 'past' based on its schedule.
 */
export function getVisitTimeBucket(visit, tz) {
  const { startDate, endDate } = getVisitScheduleInfo(visit, tz);
  const now = new Date();
  if (startDate && startDate.toDateString() === now.toDateString()) return 'today';
  if (endDate && endDate < now) return 'past';
  if (startDate && startDate > now) return 'upcoming';
  return startDate ? 'past' : 'upcoming';
}

/**
 * Map a visit status string to a high-level state.
 */
export function visitStateForStatus(status) {
  const value = (status || '').toLowerCase();
  if (['pending', 'checking_in'].includes(value)) return 'scheduled';
  if (['active', 'checking_out'].includes(value)) return 'active';
  if (['completed', 'failed', 'cancelled'].includes(value)) return 'completed';
  return value || 'scheduled';
}

/**
 * Whether a visit can be checked out.
 */
export function isCheckoutEligible(visit) {
  const status = (visit?.status || '').toLowerCase();
  const checkinStatus = (visit?.checkin_status || '').toLowerCase();
  if (['completed', 'failed', 'cancelled'].includes(status)) return false;
  return status === 'active' || status === 'checking_out' || checkinStatus === 'confirmed';
}

/**
 * Whether a visit is in a terminal state (no further actions).
 */
export function isTerminalVisit(visit) {
  const status = (visit?.status || '').toLowerCase();
  return ['completed', 'failed', 'cancelled'].includes(status);
}

/**
 * Whether a visit can be confirmed (pending only).
 */
export function isConfirmEligible(visit) {
  const status = (visit?.status || '').toLowerCase();
  return status === 'pending';
}
