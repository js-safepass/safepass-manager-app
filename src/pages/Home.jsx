import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Container, Row, Spinner } from 'react-bootstrap';
import SectionCard from '../components/SectionCard.jsx';
import { useApi } from '../state/useApi.js';
import { useAuth } from '../state/useAuth.js';
import { getUserFacingError } from '../lib/userErrors.js';

// Phase-0 landing screen: proves the auth → API → render loop end-to-end
// against mock or staging, in the ported design system (page anatomy per
// sentinel-ui ui-ux.md: h4.fw-bold page title, metric tiles, SectionCard).
// Replaced by the real workspace (scope selector + notifications +
// dashboard) in Phase 1.
export default function Home() {
  const api = useApi();
  const { signOut } = useAuth();
  const [whoami, setWhoami] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [who, ntf] = await Promise.all([api.whoami(), api.listNotifications()]);
        if (cancelled) return;
        setWhoami(who?.data || null);
        setNotifications(ntf?.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(getUserFacingError(err, 'load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0">SafePass Manager</h4>
        <Button variant="outline-secondary" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>

      {loading && (
        <div className="text-muted small py-3">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading workspace…
        </div>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && whoami && (
        <Row className="g-3">
          <Col md={6}>
            <SectionCard
              title={whoami.scope_label || 'Workspace'}
              subtitle="Resolved scope for the signed-in principal"
            >
              <p className="mb-0 text-muted">
                Signed in as {whoami.email || whoami.user_id}
              </p>
            </SectionCard>
          </Col>
          <Col md={6}>
            <SectionCard
              title="Notifications"
              action={unread > 0 ? <Badge bg="primary">{unread} unread</Badge> : null}
            >
              {notifications.length === 0 ? (
                <div className="text-muted small py-3 text-center">No notifications yet.</div>
              ) : (
                <ul className="list-unstyled mb-0">
                  {notifications.map((n) => (
                    <li key={n.id} className={n.read_at ? 'text-muted' : 'fw-semibold'}>
                      {n.title}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </Col>
        </Row>
      )}
    </Container>
  );
}
