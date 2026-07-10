const FALLBACK_MESSAGES = {
  general: 'Something went wrong. Please try again.',
  identify: 'We could not process that photo. Please try again.',
  candidateConfirm: 'We could not confirm that match. Please enter your details manually.',
  checkin: 'We could not complete check-in. Please try again.',
  setupLoad: 'We could not load setup options. Please try again.',
  setupStart: 'We could not start the kiosk session. Please try again.',
  unlock: 'Passcode is incorrect. Please try again.',
  signIn: 'Sign-in could not be completed. Please try again.',
  signOut: 'We could not sign you out. Please try again.',
  upload: 'We could not upload the photo. Please retake it and try again.',
};

const CODE_MESSAGES = {
  BUILDING_REQUIRED: 'This kiosk is missing a building assignment. Please ask staff for help.',
  CHECKIN_QUEUE_FULL: 'Check-in is busy right now. Please see staff for assistance.',
  CHECKIN_UNAVAILABLE: 'Check-in is unavailable right now. Please see staff for assistance.',
  FACE_COLLECTION_NOT_CONFIGURED: 'Photo matching is unavailable right now. You can continue manually.',
  FACE_IDENTIFY_SIGNING_KEY_MISSING: 'Photo matching is unavailable right now. You can continue manually.',
  FACE_INDEX_MULTIPLE_FACES: 'Multiple faces were detected. Please make sure only one person is in frame.',
  FACE_INDEX_NO_FACE: 'No face was detected. Center your face and try again.',
  FACE_MATCH_FAILED: 'We could not find a match. You can continue by entering your details manually.',
  FACIAL_RECOGNITION_DISABLED: 'Photo matching is unavailable right now. You can continue manually.',
  INVALID_CANDIDATE: 'That match is no longer available. Please enter your details manually.',
  KIOSK_ACTIVATION_INVALID: 'The activation code is invalid or expired.',
  KIOSK_ACTIVATION_REQUIRED: 'An activation code is required for this station.',
  KIOSK_DPOP_INVALID: 'Your kiosk session has expired. Please sign in again.',
  KIOSK_DPOP_REPLAY: 'Your kiosk session has expired. Please sign in again.',
  KIOSK_DPOP_REQUIRED: 'Your kiosk session has expired. Please sign in again.',
  KIOSK_JWT_ROUTE_FORBIDDEN: 'That action is not available right now.',
  KIOSK_JWT_UNAVAILABLE_POST_LOCK: 'This kiosk session needs to be reset. Please sign in again.',
  KIOSK_REFRESH_TOO_SOON: 'Reconnecting…',
  KIOSK_ROUTE_NOT_ALLOWED: 'That action is not available right now.',
  KIOSK_SESSION_EXPIRED: 'This kiosk session has expired. Please sign in again.',
  KIOSK_SESSION_INVALID: 'This kiosk session is no longer valid. Please sign in again.',
  KIOSK_SESSION_LOCKED: 'This kiosk is locked.',
  KIOSK_SESSION_LOCKOUT: 'This kiosk was reset after too many incorrect passcode attempts. Please sign in again.',
  KIOSK_SESSION_MAX_EXPIRED: 'This kiosk session has expired. Please sign in again.',
  KIOSK_SESSION_NOT_LOCKED: 'This kiosk is already unlocked.',
  KIOSK_SESSION_REFRESH_REQUIRED: 'Reconnecting…',
  KIOSK_SESSION_REQUIRED: 'This kiosk session has expired. Please sign in again.',
  KIOSK_SESSION_REVOKED: 'This kiosk session has been revoked. Please sign in again.',
  KIOSK_STATION_DISABLED: 'This kiosk station has been disabled. Please contact an administrator.',
  KIOSK_STATION_REASSIGNED: 'This kiosk station has been reassigned. Please sign in again.',
  KIOSK_UNLOCK_COOLDOWN: 'Too many incorrect passcode attempts. Please wait and try again.',
  KIOSK_UNLOCK_INVALID: 'Passcode is incorrect. Please try again.',
  KIOSK_UNLOCK_PASSCODE_NOT_SET: 'An unlock passcode has not been set yet.',
  KIOSK_UNLOCK_PASSCODE_REQUIRED: 'Enter the unlock passcode to continue.',
  KIOSK_UNLOCK_SESSION_RESET_REQUIRED: 'This kiosk session has expired. Please start a new session.',
  MEDIA_INVALID: 'We could not use that photo. Please retake it and try again.',
  NETWORK_ERROR: 'We could not connect. Please try again.',
  NO_AVAILABLE_BADGES: 'No badges are available right now. Please see staff for assistance.',
  ORG_MISMATCH: 'That match is no longer available. Please enter your details manually.',
  RATE_LIMITED: 'Please wait a moment and try again.',
  REVIEW_REQUIRED: 'This check-in needs staff review before it can continue.',
  VISITOR_ALREADY_CHECKED_IN: 'This visitor is already checked in.',
  VISITOR_CHECKIN_IN_PROGRESS: 'This visitor is already being checked in.',
  VISITOR_NOT_AVAILABLE: 'This visitor is not available for check-in right now.',
  VISITOR_NOT_FOUND: 'We could not find that visitor. Please enter the details again.',
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
    /\b(?:visit|visitor|media|candidate|session|request|trace|org|division|location|building|station)[-_ ]?id\b/i.test(message) ||
    /\b(?:visit|visitor|media|candidate|session|request|trace|org|division|location|building|station)[-_][A-Za-z0-9-]+\b/i.test(message)
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
  if (/kiosk session required|dpop keys missing/i.test(normalized)) {
    return 'This kiosk session has expired. Please sign in again.';
  }
  if (/kiosk jwt required/i.test(normalized)) {
    return resolveFallback('signIn');
  }
  if (/missing cognito hosted ui configuration/i.test(normalized)) {
    return 'Sign-in is unavailable right now.';
  }
  if (/invalid sign-in state|missing pkce verifier|token response missing access token|token exchange failed/i.test(normalized)) {
    return resolveFallback('signIn');
  }
  if (/access_denied/i.test(normalized)) {
    return 'Sign-in was cancelled.';
  }

  return sanitizeMessage(normalized) || resolveFallback(fallback);
}

// Classifies a check-in submit error into a UX group that drives the modal copy
// and button set. Groups are mutually exclusive; codes outside the known set
// (network, 5xx, unmapped) fall through to 'transient' so the visitor can retry.
const CHECKIN_ERROR_GROUPS = {
  alreadyCheckedIn: {
    codes: ['VISITOR_ALREADY_CHECKED_IN', 'VISITOR_CHECKIN_IN_PROGRESS'],
    message: 'You are already checked in. Please contact the front desk.',
    action: 'startOver',
  },
  unrecoverable: {
    codes: ['VISITOR_NOT_AVAILABLE', 'BUILDING_REQUIRED', 'VISITOR_NOT_FOUND', 'VISITOR_ARCHIVED'],
    message: 'We were unable to check you in. Please contact the front desk.',
    action: 'startOver',
  },
  transient: {
    codes: ['CHECKIN_QUEUE_FULL', 'NO_AVAILABLE_BADGES', 'CHECKIN_UNAVAILABLE'],
    message: 'We were temporarily unable to check you in. Please try again shortly or contact the front desk.',
    action: 'retry',
  },
  needsStaff: {
    codes: ['REVIEW_REQUIRED', 'BACKGROUND_CHECK_REQUIRED'],
    message: 'Your check-in requires approval before proceeding. Please contact the front desk.',
    action: 'startOver',
  },
  photo: {
    codes: ['FACE_INDEX_NO_FACE'], // , 'FACE_INDEX_MULTIPLE_FACES'
    message: 'We could not verify your photo. Please retake your photo.',
    action: 'startOver',
  },
  orgMismatch: {
    codes: ['ORG_MISMATCH'],
    message: CODE_MESSAGES.ORG_MISMATCH,
    action: 'startOver',
  },
};

export function classifyCheckinError(error) {
  const code = typeof error === 'object' && error ? error.code : null;
  if (code) {
    for (const [group, def] of Object.entries(CHECKIN_ERROR_GROUPS)) {
      if (def.codes.includes(code)) {
        return { group, message: def.message, action: def.action };
      }
    }
  }
  // Unknown / network / 5xx — treat as transient so a retry is offered.
  return {
    group: 'transient',
    message: CHECKIN_ERROR_GROUPS.transient.message,
    action: 'retry',
  };
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
    if (error.status === 401 || error.status === 403) {
      if (fallback === 'upload') {
        return resolveFallback(fallback);
      }
      return 'Your kiosk session has expired. Please sign in again.';
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
