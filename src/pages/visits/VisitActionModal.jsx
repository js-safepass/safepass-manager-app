import { Badge, Button, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge.jsx';
import { badgeStatus } from '../../lib/badgePipeline.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { visitEndTime, visitStartTime } from '../../lib/visitTimes.js';
import { hostContactName } from '../../lib/visitHost.js';
import { isCheckoutEligible, isConfirmEligible } from '../../lib/visitHelpers.js';
import { tapLight } from '../../lib/native/haptics.js';

function InfoRow({ label, children }) {
  return (
    <div className="d-flex justify-content-between align-items-center gap-3">
      <span className="text-muted text-uppercase">{label}</span>
      <span className="text-end text-truncate">{children}</span>
    </div>
  );
}

// Row-tap action surface for the visits list. DELIBERATE divergence from the
// web UI (owner decision 2026-07-23): the list keeps clean data columns and a
// tap opens this modal with the visit's summary + eligible lifecycle actions —
// a thumb-first pattern for the phone/tablet form factor this app ships to.
// Eligibility still comes from visitHelpers; the caller owns the actual
// action handlers (and their outcome haptics) — buttons here only add the
// press tick.
export default function VisitActionModal({
  visit, visitorName, busy, onConfirm, onCheckout, onCancel, onClose,
}) {
  if (!visit) return null;

  const press = (handler) => () => {
    tapLight(); // modal confirm press — the outcome buzz comes from the action
    handler(visit);
  };

  return (
    <Modal show onHide={busy ? undefined : onClose} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          {visitorName}
          <StatusBadge status={visit.status} />
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Field names are wire truth from dto.VisitOut (2026-07-24) —
            location_name, visitor_name, and host_contact ride the visit
            payload itself, no expand needed. */}
        <div className="d-flex flex-column gap-2 small">
          <InfoRow label="Start">{formatDateTime(visitStartTime(visit)) || '—'}</InfoRow>
          <InfoRow label="End">{visitEndTime(visit) ? formatDateTime(visitEndTime(visit)) : '—'}</InfoRow>
          <InfoRow label="Location">{visit.location_name || '—'}</InfoRow>
          <InfoRow label="Host">{hostContactName(visit.host_contact) || '—'}</InfoRow>
          <InfoRow label="Badge">
            <span className="d-inline-flex align-items-center gap-2">
              {visit.badge_id && <span className="text-muted">{visit.badge_id}</span>}
              <StatusBadge status={badgeStatus(visit)} />
            </span>
          </InfoRow>
          {/* Async check-in worker sub-state: surfaced while the pipeline is
              mid-flight or after it errored — silent otherwise. */}
          {visit.status === 'checking_in' && visit.checkin_status && (
            <InfoRow label="Check-in">
              <span className="text-capitalize">{visit.checkin_status.replaceAll('_', ' ')}</span>
            </InfoRow>
          )}
          {visit.checkin_last_error && (
            <InfoRow label="Check-in error">
              <span className="text-danger">{visit.checkin_last_error}</span>
            </InfoRow>
          )}
          {visit.flags?.geofence_breach && (
            <InfoRow label="Geofence">
              <Badge bg="danger">Breached during visit</Badge>
            </InfoRow>
          )}
          <InfoRow label="Visitor record">
            <Link to={`/visitors/${visit.visitor_id}`} onClick={onClose}>
              View visitor <i className="fas fa-arrow-right ms-1" aria-hidden="true" />
            </Link>
          </InfoRow>
        </div>
      </Modal.Body>
      <Modal.Footer className="flex-wrap">
        {isConfirmEligible(visit) && (
          <Button variant="primary" disabled={busy} onClick={press(onConfirm)}>
            <i className="fas fa-check me-2" aria-hidden="true" />
            Confirm
          </Button>
        )}
        {isCheckoutEligible(visit) && (
          <Button variant="primary" disabled={busy} onClick={press(onCheckout)}>
            <i className="fas fa-arrow-right-from-bracket me-2" aria-hidden="true" />
            Check out
          </Button>
        )}
        {visit.status === 'pending' && (
          <Button variant="outline-danger" disabled={busy} onClick={press(onCancel)}>
            <i className="fas fa-ban me-2" aria-hidden="true" />
            Cancel visit
          </Button>
        )}
        <Button variant="outline-secondary" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
