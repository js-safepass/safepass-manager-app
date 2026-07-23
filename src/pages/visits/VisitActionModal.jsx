import { Button, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge.jsx';
import { badgeStatus } from '../../lib/badgePipeline.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { visitEndTime, visitStartTime } from '../../lib/visitTimes.js';
import { isCheckoutEligible, isConfirmEligible } from '../../lib/visitHelpers.js';
import { tapLight } from '../../lib/native/haptics.js';

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
        <div className="d-flex flex-column gap-2 small">
          <div className="d-flex justify-content-between">
            <span className="text-muted text-uppercase">Start</span>
            <span>{formatDateTime(visitStartTime(visit)) || '—'}</span>
          </div>
          <div className="d-flex justify-content-between">
            <span className="text-muted text-uppercase">End</span>
            <span>{visitEndTime(visit) ? formatDateTime(visitEndTime(visit)) : '—'}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <span className="text-muted text-uppercase">Badge</span>
            <StatusBadge status={badgeStatus(visit)} />
          </div>
          <div className="d-flex justify-content-between">
            <span className="text-muted text-uppercase">Visitor record</span>
            <Link to={`/visitors/${visit.visitor_id}`} onClick={onClose}>
              View visitor <i className="fas fa-arrow-right ms-1" aria-hidden="true" />
            </Link>
          </div>
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
