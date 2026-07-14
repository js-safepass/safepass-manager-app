import { useCallback, useEffect, useState } from 'react';
import { Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import SectionCard from '../components/SectionCard.jsx';
import { useApi } from '../state/useApi.js';
import { useSession } from '../state/useSession.js';
import { useNotifications } from '../state/useNotifications.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { formatDateTime } from '../lib/format/datetime.js';

const TILES = [
  { key: 'on_site_now', label: 'On site now', icon: 'fa-location-dot' },
  { key: 'checking_in', label: 'Checking in', icon: 'fa-arrow-right-to-bracket' },
  { key: 'visits_today', label: 'Visits today', icon: 'fa-clipboard-list' },
  { key: 'pending_review', label: 'Pending review', icon: 'fa-user-clock' },
];

// Operational landing: live metric tiles + the notification feed — journey 1
// ("monitor the floor") in the brief. Metrics poll at the standard 15–30s
// cadence. Metric keys are the mock's provisional shapes (decision #10);
// re-check when the backend freezes the metrics group.
export default function Dashboard() {
  const api = useApi();
  const { activeOrgId, activeScope } = useSession();
  const { notifications, unreadCount } = useNotifications();
  const [metrics, setMetrics] = useState(null);

  const load = useCallback(async () => {
    const res = await api.getMetrics({
      presets: 'visitors,ops',
      org_id: activeOrgId,
      division_id: activeScope?.divisionId || undefined,
      location_id: activeScope?.locationId || undefined,
      building_id: activeScope?.buildingId || undefined,
    });
    setMetrics(res?.data || null);
  }, [api, activeOrgId, activeScope]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useScopedPolling({ channel: 'dashboard-metrics', poll: load, intervalMs: 20_000 });

  const recent = notifications.slice(0, 6);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0">Dashboard</h4>
      </div>

      <Row className="g-3 mb-4">
        {TILES.map((tile) => (
          <Col xs={6} lg={3} key={tile.key}>
            <div className="card mb-0 h-100">
              <div className="card-body d-flex align-items-center gap-3">
                <i className={`fas ${tile.icon} fs-4 text-primary`} aria-hidden="true" />
                <div>
                  <div className="text-muted small text-uppercase">{tile.label}</div>
                  <div className="fs-3 fw-bold">{metrics ? metrics[tile.key] ?? '—' : '…'}</div>
                </div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row className="g-3">
        <Col lg={7}>
          <SectionCard
            title="Latest notifications"
            subtitle="Live feed — arrivals, alerts, and check-in failures"
            action={<Link to="/notifications" className="small">View all{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}</Link>}
          >
            {recent.length === 0 ? (
              <div className="text-muted small py-3 text-center">No notifications yet.</div>
            ) : (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                {recent.map((n) => (
                  <li key={n.id} className="d-flex align-items-baseline gap-2">
                    <i
                      className={`fas fa-circle small ${n.read_at ? 'text-secondary opacity-25' : 'text-primary'}`}
                      style={{ fontSize: '0.5rem' }}
                      aria-hidden="true"
                    />
                    <span className={`flex-grow-1 ${n.read_at ? 'text-muted' : 'fw-semibold'}`}>{n.title}</span>
                    <span className="text-muted small text-nowrap">{formatDateTime(n.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </Col>
        <Col lg={5}>
          <SectionCard title="Quick actions">
            <div className="d-grid gap-2">
              <Link to="/visitors" className="btn btn-primary">
                <i className="fas fa-users me-2" aria-hidden="true" />
                Visitor directory
              </Link>
              <Link to="/visits" className="btn btn-outline-primary">
                <i className="fas fa-clipboard-list me-2" aria-hidden="true" />
                Today's visits
              </Link>
            </div>
          </SectionCard>
        </Col>
      </Row>
    </>
  );
}
