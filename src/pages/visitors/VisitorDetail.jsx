import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Col, Row, Spinner, Table } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VisitorFormModal from './VisitorFormModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { getUserFacingError } from '../../lib/userErrors.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { isTerminalVisit } from '../../lib/visitHelpers.js';

function FieldRow({ label, children }) {
  return (
    <Row className="py-2 border-bottom mx-0">
      <Col sm={4} className="text-muted small text-uppercase">{label}</Col>
      <Col sm={8}>{children || <span className="text-muted">—</span>}</Col>
    </Row>
  );
}

// Visitor record: full details, visit history, front-desk actions. Check-in
// is the one-call fallback path from the brief (POST /visitors/{id}/checkin
// matches/creates the visit and queues the badge pipeline); gate failures
// (428 review required, 409 already checked in, …) surface via the standard
// error catalogue. The station picker joins this flow in Phase 3.
export default function VisitorDetail() {
  const { visitorId } = useParams();
  const api = useApi();
  const { activeOrgId } = useSession();
  const flash = useFlash();
  const navigate = useNavigate();
  const [visitor, setVisitor] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, vs] = await Promise.all([
        api.getVisitor(visitorId),
        api.listVisits({ org_id: activeOrgId, visitor_id: visitorId, limit: 20 }),
      ]);
      setVisitor(v?.data || null);
      setVisits(vs?.data || []);
    } catch (err) {
      setError(getUserFacingError(err, 'load'));
    } finally {
      setLoading(false);
    }
  }, [api, activeOrgId, visitorId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasOpenVisit = visits.some((v) => !isTerminalVisit(v));

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      // org_id in the body per the check-in contract (sentinel-ui
      // process-flows: all create/confirm/check-in calls send org_id).
      await api.checkin(visitorId, { org_id: activeOrgId });
      flash.success(`Check-in started for ${visitor.first_name} ${visitor.last_name}.`);
      navigate('/visits');
    } catch (err) {
      flash.error(getUserFacingError(err, 'checkin'));
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="text-muted small py-4">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading visitor…
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!visitor) return null;

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <div className="flex-grow-1">
          <div className="text-muted small">
            <Link to="/visitors">Visitors</Link> / {visitor.first_name} {visitor.last_name}
          </div>
          <h4 className="fw-bold mb-0 d-flex align-items-center gap-2">
            {visitor.first_name} {visitor.last_name}
            <StatusBadge status={visitor.status} />
          </h4>
        </div>
        <Button variant="outline-primary" onClick={() => setShowEdit(true)}>
          <i className="fas fa-pen me-2" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="primary"
          onClick={checkIn}
          disabled={checkingIn || hasOpenVisit || visitor.status !== 'active'}
          title={hasOpenVisit ? 'This visitor already has an open visit' : undefined}
        >
          {checkingIn ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Checking in…
            </>
          ) : (
            <>
              <i className="fas fa-arrow-right-to-bracket me-2" aria-hidden="true" />
              Check in
            </>
          )}
        </Button>
      </div>

      <Row className="g-3">
        <Col lg={5}>
          <SectionCard title="Details" bodyClassName="pt-2">
            <FieldRow label="Email">{visitor.email}</FieldRow>
            <FieldRow label="Phone">{visitor.phone}</FieldRow>
            <FieldRow label="Company">{visitor.company}</FieldRow>
            <FieldRow label="Type"><span className="text-capitalize">{visitor.type}</span></FieldRow>
            <FieldRow label="Notes">{visitor.notes}</FieldRow>
            <FieldRow label="Created">{formatDateTime(visitor.created_at)}</FieldRow>
            <FieldRow label="Updated">{formatDateTime(visitor.updated_at)}</FieldRow>
          </SectionCard>
        </Col>
        <Col lg={7}>
          <SectionCard title="Visit history" bodyClassName={visits.length ? 'p-0' : undefined}>
            {visits.length === 0 ? (
              <div className="text-muted small py-3 text-center">No visits recorded.</div>
            ) : (
              <Table responsive hover className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Status</th>
                    <th className="d-none d-sm-table-cell">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <td>{formatDateTime(v.scheduled_start || v.created_at)}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td className="d-none d-sm-table-cell">
                        {v.badge_render_error || v.badge_encode_error ? (
                          <StatusBadge status="failed" />
                        ) : v.badge_encoded_media_id ? (
                          <StatusBadge status="encoded_ready" />
                        ) : v.badge_raw_media_id ? (
                          <StatusBadge status="rendered" />
                        ) : isTerminalVisit(v) ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <StatusBadge status="pending" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </SectionCard>
        </Col>
      </Row>

      <VisitorFormModal
        show={showEdit}
        visitor={visitor}
        onClose={() => setShowEdit(false)}
        onSaved={() => load()}
      />
    </>
  );
}
