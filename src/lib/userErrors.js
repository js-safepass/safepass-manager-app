// User-facing error text, one place only. Components never hand-roll error
// strings — they call getUserFacingError(err, context) (DECISIONS D13 in the
// seed bundle). Branch on the stable RFC7807 `code`; the free-text `detail`
// is never shown raw (sanitizeMessage filters technical/sensitive strings).
//
// Audience note: this app is staff-facing (front-desk operators, admins,
// auditors) — messages address a staff user working a queue, not a visitor
// at a kiosk. The catalogue is rewritten per-flow as screens get built;
// codes come from docs/contractor-handoff/3-api-spec.yaml.

const FALLBACK_MESSAGES = {
  general: 'Something went wrong. Please try again.',
  signIn: 'Sign-in could not be completed. Please try again.',
  signOut: 'You could not be signed out. Please try again.',
  load: 'This could not be loaded. Please try again.',
  save: 'Your changes could not be saved. Please try again.',
  checkin: 'Check-in could not be completed.',
  upload: 'The photo could not be uploaded. Please try again.',
};

const CODE_MESSAGES = {
  // Auth / access
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have access to do that.',
  // Session lifecycle (auth-contract §2). Primarily routed as actions
  // (authActions.js); the text here is the fallback if a screen surfaces the
  // raw error so a code never leaks. MFA is enforced by Cognito at the pool
  // level, so no MFA_* code reaches the app.
  ID_TOKEN_REQUIRED: 'Your session needs to be refreshed. Please sign in again.',
  USER_ACCOUNT_INACTIVE: 'Your account is inactive. Contact your SafePass administrator.',
  // Backend app-client gate (CLAUDE.md "authorization gate"): the action is
  // outside this app's policy by design — a config/product boundary, not a
  // retryable user error.
  APP_POLICY_DENIED: 'This action is not available in this app.',
  NOT_FOUND: 'That record could not be found.',

  // Check-in gates (front-desk fallback flow; codes per the brief §4)
  REVIEW_REQUIRED: 'This visitor needs review before they can be checked in.',
  BACKGROUND_CHECK_REQUIRED: 'This visitor needs a background check before they can be checked in.',
  VISITOR_ALREADY_CHECKED_IN: 'This visitor is already checked in.',
  VISITOR_CHECKIN_IN_PROGRESS: 'This visitor is already being checked in.',
  NO_AVAILABLE_BADGES: 'No badges are available in the selected station’s pool.',
  CHECKIN_QUEUE_FULL: 'Check-in is busy right now. Please try again shortly.',
  CHECKIN_UNAVAILABLE: 'Check-in is unavailable right now. Please try again shortly.',
  BUILDING_REQUIRED: 'A building must be selected before check-in.',

  // Records
  VISITOR_NOT_FOUND: 'That visitor could not be found.',
  VISITOR_NOT_AVAILABLE: 'This visitor is not available for check-in right now.',

  // Media / face enrollment (photo enrollment flow)
  FACE_INDEX_NO_FACE: 'No face was detected in that photo. Please use a clear, front-facing photo.',
  FACE_INDEX_MULTIPLE_FACES: 'Multiple faces were detected. Please use a photo of just the visitor.',
  MEDIA_INVALID: 'That file could not be used. Please try a different photo.',

  // Generic transport
  NETWORK_ERROR: 'Could not connect. Check your connection and try again.',
  RATE_LIMITED: 'Please wait a moment and try again.',
};

function resolveFallback(fallback) {
  if (!fallback) return FALLBACK_MESSAGES.general;
  return FALLBACK_MESSAGES[fallback] || fallback;
}

function looksTechnical(message) {
  return (
    /https?:\/\//i.test(message) ||
    /\/v\d+\//i.test(message) ||
    /[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+/.test(message) ||
    /\{.+\}/.test(message) ||
    /\[[^[\]]+\]/.test(message)
  );
}

function containsSensitiveId(message) {
  return (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(message) ||
    /\b(?:visit|visitor|media|session|request|trace|org|division|location|building|station|host)[-_ ]?id\b/i.test(message) ||
    /\b(?:visit|visitor|media|session|request|trace|org|division|location|building|station|host)[-_][A-Za-z0-9-]+\b/i.test(message)
  );
}

function sanitizeMessage(rawMessage) {
  if (typeof rawMessage !== 'string') return null;
  const message = rawMessage.replace(/^error:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!message) return null;
  if (message.length > 160) return null;
  if (looksTechnical(message) || containsSensitiveId(message)) return null;
  return message;
}

function normalizeStringError(message, fallback) {
  const normalized = message?.trim();
  if (!normalized) return resolveFallback(fallback);

  if (/failed to fetch|load failed|networkerror|network request failed/i.test(normalized)) {
    return CODE_MESSAGES.NETWORK_ERROR;
  }
  if (/sign-in required/i.test(normalized)) {
    return CODE_MESSAGES.UNAUTHORIZED;
  }
  if (/missing cognito hosted ui configuration/i.test(normalized)) {
    return 'Sign-in is unavailable right now.';
  }
  if (/invalid sign-in state|missing pkce verifier|token response missing (an )?(id|access) token|token exchange failed/i.test(normalized)) {
    return resolveFallback('signIn');
  }
  if (/access_denied/i.test(normalized)) {
    return 'Sign-in was cancelled.';
  }

  return sanitizeMessage(normalized) || resolveFallback(fallback);
}

export function getUserFacingError(error, fallback = 'general') {
  if (typeof error === 'string') {
    return normalizeStringError(error, fallback);
  }

  const code = error?.code;
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  if (typeof error?.status === 'number') {
    if (error.status === 401) {
      return CODE_MESSAGES.UNAUTHORIZED;
    }
    if (error.status === 403) {
      return CODE_MESSAGES.FORBIDDEN;
    }
    if (error.status === 429) {
      return CODE_MESSAGES.RATE_LIMITED;
    }
    if (error.status >= 500) {
      return resolveFallback(fallback);
    }
  }

  if (error instanceof TypeError) {
    return CODE_MESSAGES.NETWORK_ERROR;
  }

  return normalizeStringError(error?.message, fallback);
}
