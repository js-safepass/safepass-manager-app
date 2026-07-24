import { useCallback, useEffect, useState } from 'react';
import { Col, Row } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard.jsx';
import VisitScheduleLabel from '../components/VisitScheduleLabel.jsx';
import { useApi } from '../state/useApi.js';
import { useSession } from '../state/useSession.js';
import { useNotifications } from '../state/useNotifications.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { formatDateTime } from '../lib/format/datetime.js';
import { groupUpcomingVisits } from '../lib/upcomingVisits.js';
import { tapLight } from '../lib/native/haptics.js';

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
  const navigate = useNavigate();
  const { activeOrgId, activeScope } = useSession();
  const { notifications, unreadCount } = useNotifications();
  const [metrics, setMetrics] = useState(null);
  // Today's pending arrivals (Overdue + Today buckets), soonest first; null =
  // first load in flight. Names ride the expand includes.
  const [arrivals, setArrivals] = useState(null);
  const [arrivalVisitors, setArrivalVisitors] = useState({});

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

  // Arriving-today feed (scheduled-visits plan step 2). Filtering to "today"
  // and counting are client-side by wire-truth necessity: /v1/visits has no
  // time-window filters, and the metrics presets are still provisional
  // (decision #10) — the fetch itself is the count. Same location/building
  // scoping rule as VisitsList (division isn't a supported filter). 60s
  // cadence: arrivals move slowly; the Visits tab's 15s poll is the live
  // surface.
  const loadArrivals = useCallback(async () => {
    const page = await api.listVisits({
      org_id: activeOrgId,
      location_id: activeScope?.locationId || undefined,
      building_id: activeScope?.buildingId || undefined,
      limit: 50,
      status: 'pending',
      expand: 'visitors',
    });
    const todays = groupUpcomingVisits(page?.data || [])
      .filter((g) => g.key !== 'later')
      .flatMap((g) => g.visits);
    setArrivals(todays);
    setArrivalVisitors(page?.includes?.visitors || {});
  }, [api, activeOrgId, activeScope]);

  useEffect(() => {
    loadArrivals().catch(() => {});
  }, [loadArrivals]);
  useScopedPolling({ channel: 'dashboard-arrivals', poll: loadArrivals, intervalMs: 60_000 });

  const arrivalName = (v) => {
    const visitor = arrivalVisitors[v.visitor_id];
    return visitor ? `${visitor.first_name} ${visitor.last_name}` : (v.visitor_name || v.visitor_id);
  };

  const recent = notifications.slice(0, 6);
  const nextArrivals = (arrivals || []).slice(0, 5);

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
          {/* Arrivals lead the column: the next person through the door beats
              the notification backlog for a front desk (plan step 2). Row tap
              deep-links into the Visits tab with that visit's action modal
              open (?open= seam — VisitsList consumes it). */}
          <SectionCard
            title="Arriving today"
            subtitle="Scheduled visits still expected at this workspace"
            action={(
              <Link to="/visits" className="small">
                View all{arrivals && arrivals.length > 0 ? ` (${arrivals.length})` : ''}
              </Link>
            )}
            className="mb-3"
          >
            {arrivals === null ? (
              <div className="text-muted small py-3 text-center">Loading…</div>
            ) : arrivals.length === 0 ? (
              <div className="text-muted small py-3 text-center">No scheduled arrivals left today.</div>
            ) : (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                {nextArrivals.map((v) => (
                  <li
                    key={v.id}
                    role="button"
                    className="d-flex align-items-center gap-2"
                    onClick={() => {
                      tapLight();
                      navigate(`/visits?open=${v.id}`);
                    }}
                  >
                    <i className="fas fa-user-clock text-primary" aria-hidden="true" />
                    <span className="flex-grow-1 min-w-0">
                      <span className="d-block fw-semibold text-truncate">{arrivalName(v)}</span>
                      <span className="d-block small"><VisitScheduleLabel visit={v} /></span>
                    </span>
                    <i className="fas fa-chevron-right text-muted small" aria-hidden="true" />
                  </li>
                ))}
                {arrivals.length > nextArrivals.length && (
                  <li className="text-muted small">
                    + {arrivals.length - nextArrivals.length} more — <Link to="/visits">see the Visits tab</Link>
                  </li>
                )}
              </ul>
            )}
          </SectionCard>
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
                    {/* Title on its own row ABOVE the timestamp (owner
                        feedback 2026-07-24) — side by side, long titles
                        fought the nowrap timestamp on phones. */}
                    <span className="flex-grow-1 min-w-0">
                      <span className={`d-block ${n.read_at ? 'text-muted' : 'fw-semibold'}`}>{n.title}</span>
                      <span className="d-block text-muted small">{formatDateTime(n.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </Col>
        <Col lg={5}>
          <SectionCard title="Quick actions">
            <div className="d-grid gap-2">
              <Link to="/visits?schedule=1" className="btn btn-primary">
                <i className="fas fa-calendar-plus me-2" aria-hidden="true" />
                Schedule a visit
              </Link>
              <Link to="/visitors" className="btn btn-outline-primary">
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
