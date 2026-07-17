import { Alert, Button, Spinner } from 'react-bootstrap';
import { useSession } from '../state/useSession.js';
import { useAuth } from '../state/useAuth.js';

// Holds the app back until the session bootstrap resolves, and renders the
// no-access / error states as first-class screens (brief §5: "render a
// no-access state rather than retrying into a wall").
export default function SessionGate({ children }) {
  const { sessionStatus, sessionError, refreshSession } = useSession();
  const { signOut } = useAuth();

  if (sessionStatus === 'ready') return children;

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100">
      <div className="text-center" style={{ maxWidth: 420 }}>
        {sessionStatus === 'loading' && (
          <div className="text-muted">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading your workspace…
          </div>
        )}
        {sessionStatus === 'no_access' && (
          <>
            <h5 className="fw-bold mb-2">No workspace access</h5>
            <p className="text-muted">
              Your account signed in successfully but has no organization access for this
              application. Contact your SafePass administrator.
            </p>
            <Button variant="outline-secondary" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </>
        )}
        {sessionStatus === 'error' && (
          <>
            <Alert variant="danger">{sessionError}</Alert>
            <div className="d-flex gap-2 justify-content-center">
              <Button variant="primary" size="sm" onClick={refreshSession}>
                Retry
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
