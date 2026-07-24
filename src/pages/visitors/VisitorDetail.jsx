import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Col, Row, Spinner, Table } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VisitScheduleLabel from '../../components/VisitScheduleLabel.jsx';
import { useConfirmModal } from '../../components/ConfirmModal.jsx';
import VisitorFormModal from './VisitorFormModal.jsx';
import VisitActionModal from '../visits/VisitActionModal.jsx';
import ScheduleVisitModal from '../visits/ScheduleVisitModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { getUserFacingError } from '../../lib/userErrors.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { visitEndTime, visitStartTime } from '../../lib/visitTimes.js';
import { isTerminalVisit } from '../../lib/visitHelpers.js';
import { sortByScheduledStart } from '../../lib/upcomingVisits.js';
import { isCheckinGateError } from '../../lib/checkinGate.js';
import { notifyError, notifySuccess, notifyWarning, tapMedium } from '../../lib/native/haptics.js';

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
  const { activeOrgId, activeScope } = useSession();
  const flash = useFlash();
  const navigate = useNavigate();
  const { confirm: askConfirm, ConfirmDialog } = useConfirmModal();
  const [visitor, setVisitor] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  // History row tap opens the same action modal as the visits list — one
  // inspect surface fleet-wide (owner greenlight 2026-07-24).
  const [activeVisit, setActiveVisit] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

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

  // "Open" = physically in the check-in pipeline or on site. Pending
  // scheduled visits deliberately DON'T count (fixed with plan step 4): a
  // visitor with a booking is precisely who the walk-up Check in serves —
  // the backend auto-consumes their closest matchable scheduled visit.
  const hasOpenVisit = visits.some((v) => ['checking_in', 'active', 'checking_out'].includes(v.status));
  const pendingVisits = sortByScheduledStart(visits.filter((v) => v.status === 'pending'));
  const historyVisits = visits.filter((v) => v.status !== 'pending');

  // Same act() shape as VisitsList: success closes the modal and reloads,
  // failure keeps it open to retry; outcome haptics mirror the list's.
  // Check-in gate failures (428 catalogue) read as warnings, not errors —
  // the modal's Check in button routes through confirmVisit, which gates.
  const act = (message, fn, onDone = notifySuccess) => async (visit) => {
    setActionBusy(true);
    try {
      await fn(visit.id);
      onDone();
      flash.success(message);
      setActiveVisit(null);
      await load();
    } catch (err) {
      (isCheckinGateError(err) ? notifyWarning : notifyError)();
      flash.error(getUserFacingError(err));
    } finally {
      setActionBusy(false);
    }
  };

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      // Advisory match preview (backend PR #251): a walk-up check-in silently
      // consumes the visitor's closest matchable scheduled visit — surface
      // that BEFORE it happens so the operator isn't surprised. Advisory
      // only: any preview failure (endpoint not deployed, races, missing
      // scope) falls through to a plain check-in; the submit is authoritative.
      try {
        const preview = await api.getScheduledMatch(visitorId, {
          org_id: activeOrgId,
          location_id: activeScope?.locationId || undefined,
        });
        const match = preview?.data;
        if (match?.matched && match.visit?.start_time) {
          const proceed = await askConfirm({
            title: 'Scheduled visit found',
            body: `Checking in will use their scheduled visit (${formatDateTime(match.visit.start_time)}).`,
            confirmLabel: 'Check in',
            variant: 'primary',
          });
          if (!proceed) return;
        }
      } catch { /* advisory only — never blocks check-in */ }
      // org_id per the check-in contract; location_id + building_id from the
      // picked workspace scope — CheckInRequest requires BOTH (backend rejects
      // with LOCATION_REQUIRED / BUILDING_REQUIRED, verified against
      // sentinel-datamanager visits.go 2026-07-23). Unpicked levels stay
      // undefined and surface those catalogue errors rather than a silent 400.
      await api.checkin(visitorId, {
        org_id: activeOrgId,
        location_id: activeScope?.locationId || undefined,
        building_id: activeScope?.buildingId || undefined,
      });
      tapMedium(); // accepted (202) — the pipeline takes it from here
      flash.success(`Check-in started for ${visitor.first_name} ${visitor.last_name}.`);
      navigate('/visits');
    } catch (err) {
      // Gate failures (review required, already in, no badges…) are expected
      // outcomes → warning; anything else is a real failure → error.
      if (isCheckinGateError(err)) notifyWarning(); else notifyError();
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
        <Button variant="outline-primary" onClick={() => setShowSchedule(true)}>
          <i className="fas fa-calendar-plus me-2" aria-hidden="true" />
          Schedule
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
          {/* Upcoming (pending) visits sit above history — the front desk's
              question is "are they expected?", not "when were they last
              here?". Rows open the same action modal (Check in / Cancel). */}
          {pendingVisits.length > 0 && (
            <SectionCard title="Upcoming visits" bodyClassName="p-0" className="mb-3">
              <Table responsive hover className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th className="d-none d-md-table-cell">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingVisits.map((v) => (
                    <tr key={v.id} role="button" onClick={() => setActiveVisit(v)}>
                      <td className="small text-nowrap"><VisitScheduleLabel visit={v} /></td>
                      <td className="small d-none d-md-table-cell">{v.location_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </SectionCard>
          )}
          <SectionCard title="Visit history" bodyClassName={historyVisits.length ? 'p-0' : undefined}>
            {historyVisits.length === 0 ? (
              <div className="text-muted small py-3 text-center">No visits recorded.</div>
            ) : (
              <Table responsive hover className="mb-0 align-middle">
                <thead>
                  <tr>
                    {/* Wire-truth time fields via visitTimes (dto.VisitOut,
                        2026-07-24) — the old scheduled_start/created_at pair
                        doesn't exist on the API and rendered "—" for every
                        row outside the mock. */}
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Status</th>
                    <th className="d-none d-md-table-cell">Location</th>
                    <th className="d-none d-sm-table-cell">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {historyVisits.map((v) => (
                    <tr key={v.id} role="button" onClick={() => setActiveVisit(v)}>
                      <td className="small text-nowrap">
                        {formatDateTime(visitStartTime(v), undefined, { length: 'short' }) || '—'}
                      </td>
                      <td className="small text-nowrap">
                        {visitEndTime(v)
                          ? formatDateTime(visitEndTime(v), undefined, { length: 'short' })
                          : <span className="text-muted">—</span>}
                      </td>
                      <td><StatusBadge status={v.status} /></td>
                      <td className="d-none d-md-table-cell">{v.location_name || '—'}</td>
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

      <ScheduleVisitModal
        show={showSchedule}
        presetVisitor={visitor}
        onClose={() => setShowSchedule(false)}
        onScheduled={() => load()}
      />
      {ConfirmDialog}

      {activeVisit && (
        <VisitActionModal
          visit={activeVisit}
          visitorName={`${visitor.first_name} ${visitor.last_name}`}
          busy={actionBusy}
          onConfirm={act('Check-in started.', api.confirmVisit)}
          onCheckout={act('Visit checked out.', api.checkoutVisit)}
          onCancel={act('Visit cancelled.', api.cancelVisit, notifyWarning)}
          onClose={() => setActiveVisit(null)}
        />
      )}
    </>
  );
}
