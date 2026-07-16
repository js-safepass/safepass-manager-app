import PropTypes from 'prop-types';
import { Alert, Button } from 'react-bootstrap';

// MFA-completion screen. This app is core-hardening only — it has NO enrollment
// UI (that lives in the SafePass Admin app), so the user is directed there to
// remediate, then returns and refreshes. Used both at bootstrap (a trimmed,
// MFA-gated whoami — SessionGate) and mid-session (an MFA_REQUIRED /
// MFA_TOTP_REQUIRED 401 — AuthActionOverlay).
//
// `variant`:
//   'enroll' — org requires MFA and the user has no enabled factor
//   'totp'   — privileged role has a factor but needs an authenticator (TOTP)
const COPY = {
  enroll: {
    heading: 'Multi-factor authentication required',
    body: 'Your organization requires multi-factor authentication. Set it up in the SafePass Admin app, then come back and refresh to continue.',
  },
  totp: {
    heading: 'Authenticator app required',
    body: 'Your role requires an authenticator app. Add one in the SafePass Admin app’s security settings, then come back and refresh to continue.',
  },
};

export default function MfaRequiredNotice({ variant = 'enroll', onRefresh, onSignOut }) {
  const copy = COPY[variant] || COPY.enroll;
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100">
      <div className="text-center" style={{ maxWidth: 460 }}>
        <h5 className="fw-bold mb-2">{copy.heading}</h5>
        <Alert variant="warning" className="text-start">
          {copy.body}
        </Alert>
        <div className="d-flex gap-2 justify-content-center">
          {onRefresh && (
            <Button variant="primary" size="sm" onClick={onRefresh}>
              I’ve completed setup — refresh
            </Button>
          )}
          {onSignOut && (
            <Button variant="outline-secondary" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

MfaRequiredNotice.propTypes = {
  variant: PropTypes.oneOf(['enroll', 'totp']),
  onRefresh: PropTypes.func,
  onSignOut: PropTypes.func,
};
