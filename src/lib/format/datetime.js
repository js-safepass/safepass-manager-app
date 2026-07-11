// format/datetime.js — Centralized date/time formatting with timezone support.
//
// All functions accept an optional IANA timezone string (e.g. 'America/New_York').
// When omitted, the browser's local timezone is used.
// When a timezone IS provided, a short abbreviation (e.g. "UTC", "EST") is appended
// so the user can tell which timezone the displayed time is in.
//
// Usage:
//   import { formatDateTime, formatDate, formatTime } from '../../lib/format/datetime';
//   const tz = useTimezone();          // from hooks/useTimezone.js
//   formatDateTime(row.created_at, tz) // => "Mar 31, 2025, 1:39 PM UTC"

const PLACEHOLDER = '\u2014'; // em-dash for missing values

/**
 * Safely parse a value into a Date.
 * Accepts: ISO 8601 string, epoch-seconds number, epoch-ms number, or Date instance.
 * Returns null for unparseable / missing values.
 */
function toDate(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Heuristic: if < 1e12 treat as epoch-seconds, otherwise epoch-ms.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─── Formatter cache ──────────────────────────────────────────────────────────
// Intl.DateTimeFormat construction is expensive; cache by options key.
const formatterCache = new Map();
const MAX_CACHE_SIZE = 200;

function getFormatter(locale, options) {
  const key = `${locale || ''}|${JSON.stringify(options)}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    if (formatterCache.size >= MAX_CACHE_SIZE) formatterCache.clear();
    fmt = new Intl.DateTimeFormat(locale || undefined, options);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

// ─── Public formatters ────────────────────────────────────────────────────────

/**
 * Format a date+time value for display.
 *
 * @param {string|number|Date} value — ISO string, epoch-seconds, epoch-ms, or Date
 * @param {string} [timezone] — IANA timezone (e.g. 'America/New_York'). Omit for browser local.
 * @param {object} [opts]
 * @param {string} [opts.locale] — BCP 47 locale tag; omit for browser default
 * @param {'short'|'medium'|'long'} [opts.length='medium'] — preset length
 * @param {string} [opts.placeholder] — returned when value is missing/invalid
 * @param {boolean} [opts.showTzName=true] — show timezone abbreviation when tz is explicit
 * @returns {string}
 */
export function formatDateTime(value, timezone, opts = {}) {
  const d = toDate(value);
  if (!d) return opts.placeholder ?? PLACEHOLDER;

  const showTzName = opts.showTzName !== false && !!timezone;
  const length = opts.length || 'medium';

  // Can't mix dateStyle/timeStyle with individual fields + timeZoneName,
  // so always use individual fields for consistent behaviour.
  let intlOpts;
  if (length === 'short') {
    intlOpts = {
      month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    };
  } else if (length === 'long') {
    intlOpts = {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
    };
  } else {
    // medium (default)
    intlOpts = {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    };
  }

  if (timezone) intlOpts.timeZone = timezone;
  if (showTzName) intlOpts.timeZoneName = 'short';

  try {
    return getFormatter(opts.locale, intlOpts).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Format a date (no time) for display.
 *
 * @param {string|number|Date} value
 * @param {string} [timezone]
 * @param {object} [opts]
 * @param {string} [opts.locale]
 * @param {'short'|'medium'|'long'} [opts.length='medium']
 * @param {string} [opts.placeholder]
 * @returns {string}
 */
export function formatDate(value, timezone, opts = {}) {
  const d = toDate(value);
  if (!d) return opts.placeholder ?? PLACEHOLDER;

  const length = opts.length || 'medium';
  let intlOpts;
  if (length === 'short') {
    intlOpts = { month: 'numeric', day: 'numeric', year: '2-digit' };
  } else if (length === 'long') {
    intlOpts = { month: 'long', day: 'numeric', year: 'numeric' };
  } else {
    intlOpts = { month: 'short', day: 'numeric', year: 'numeric' };
  }

  if (timezone) intlOpts.timeZone = timezone;

  try {
    return getFormatter(opts.locale, intlOpts).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Format a time (no date) for display.
 *
 * @param {string|number|Date} value
 * @param {string} [timezone]
 * @param {object} [opts]
 * @param {string} [opts.locale]
 * @param {boolean} [opts.seconds=false] — include seconds
 * @param {string} [opts.placeholder]
 * @param {boolean} [opts.showTzName=true] — show timezone abbreviation when tz is explicit
 * @returns {string}
 */
export function formatTime(value, timezone, opts = {}) {
  const d = toDate(value);
  if (!d) return opts.placeholder ?? PLACEHOLDER;

  const showTzName = opts.showTzName !== false && !!timezone;
  const intlOpts = {
    hour: 'numeric',
    minute: '2-digit',
    ...(opts.seconds ? { second: '2-digit' } : {}),
  };

  if (timezone) intlOpts.timeZone = timezone;
  if (showTzName) intlOpts.timeZoneName = 'short';

  try {
    return getFormatter(opts.locale, intlOpts).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/**
 * Format a relative time string (e.g. "2 hours ago", "in 3 days").
 * Falls back to formatDateTime for dates more than 7 days away.
 *
 * @param {string|number|Date} value
 * @param {string} [timezone] — only used for fallback formatting
 * @param {object} [opts]
 * @param {string} [opts.placeholder]
 * @returns {string}
 */
export function formatRelative(value, timezone, opts = {}) {
  const d = toDate(value);
  if (!d) return opts.placeholder ?? PLACEHOLDER;

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const absDiffMs = Math.abs(diffMs);
  const seconds = Math.round(absDiffMs / 1000);
  const minutes = Math.round(absDiffMs / 60000);
  const hours = Math.round(absDiffMs / 3600000);
  const days = Math.round(absDiffMs / 86400000);

  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const sign = diffMs < 0 ? -1 : 1;

    if (seconds < 60) return rtf.format(sign * seconds, 'second');
    if (minutes < 60) return rtf.format(sign * minutes, 'minute');
    if (hours < 24) return rtf.format(sign * hours, 'hour');
    if (days <= 7) return rtf.format(sign * days, 'day');
  } catch {
    // RelativeTimeFormat not available — fall through to absolute
  }

  return formatDateTime(d, timezone, opts);
}

/**
 * Format a tracking-style timestamp (compact: "Jan 5, 3:42:18 PM EST").
 * Drop-in replacement for tracking.js formatTrackingTimestamp.
 *
 * @param {number} epochSeconds
 * @param {string} [timezone]
 * @param {object} [opts]
 * @param {string} [opts.placeholder]
 * @returns {string}
 */
export function formatTrackingTimestamp(epochSeconds, timezone, opts = {}) {
  const d = toDate(epochSeconds);
  if (!d) return opts.placeholder ?? PLACEHOLDER;

  const intlOpts = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  };

  if (timezone) {
    intlOpts.timeZone = timezone;
    intlOpts.timeZoneName = 'short';
  }

  try {
    return getFormatter(undefined, intlOpts).format(d);
  } catch {
    return String(epochSeconds);
  }
}

// Re-export toDate for consumers that need raw Date objects
export { toDate };
