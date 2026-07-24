import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, ListGroup, Modal, Row, Col, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge.jsx';
import VisitorFormModal from '../visitors/VisitorFormModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { getUserFacingError } from '../../lib/userErrors.js';
import {
  defaultStartValue,
  fromDatetimeLocalValue,
  minStartValue,
  toDatetimeLocalValue,
  validateSchedule,
} from '../../lib/scheduleVisitForm.js';
import { notifyError, notifySuccess, tapLight } from '../../lib/native/haptics.js';

// Schedule-visit form (plan step 3) — the legacy "New Invitation" successor.
// A visitor RECORD is always required: the wire's visitor_name-only unlinked
// create is a spec mirage (the backend drops the field, verified 2026-07-24),
// so the picker searches existing visitors and "New visitor" branches through
// VisitorFormModal first. Host fields are deliberately absent — the backend
// defaults the host from the linked visitor (Phase 2 owns host attach).
//
// location_id AND building_id always come from the active scope: create
// doesn't require building, but confirm hard-fails 400 BUILDING_REQUIRED
// without one — attaching it here keeps every visit this app creates
// check-in-able (the acknowledged backend footgun).
//
// Reschedule mode (`replaceVisit`, plan step 5): the backend has no visit
// PATCH by design, so rescheduling is CREATE-then-cancel — the new visit
// lands first so a failure can never strand the visitor with nothing; a
// cancel failure after a successful create degrades to a warning naming the
// manual cleanup.
export default function ScheduleVisitModal({ show, presetVisitor, replaceVisit, onClose, onScheduled }) {
  const api = useApi();
  const { activeOrgId, activeScope } = useSession();
  const flash = useFlash();
  const [visitor, setVisitor] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showNewVisitor, setShowNewVisitor] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const searchSeqRef = useRef(0);

  const scopeReady = Boolean(activeScope?.locationId && activeScope?.buildingId);

  useEffect(() => {
    if (!show) return;
    setVisitor(presetVisitor || null);
    setQuery('');
    setResults(null);
    // Reschedule prefills the old slot — unless it's already in the past
    // (overdue reschedules are the common case), where "next hour" beats an
    // un-submittable stale time.
    const oldStartMs = replaceVisit?.start_time ? new Date(replaceVisit.start_time).getTime() : null;
    if (oldStartMs && oldStartMs > Date.now()) {
      setStart(toDatetimeLocalValue(oldStartMs));
      setEnd(replaceVisit.end_time ? toDatetimeLocalValue(new Date(replaceVisit.end_time).getTime()) : '');
    } else {
      setStart(defaultStartValue());
      setEnd('');
    }
    setError(null);
  }, [show, presetVisitor, replaceVisit]);

  // Debounced visitor search; sequence guard drops stale responses.
  useEffect(() => {
    if (!show || visitor || query.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const seq = ++searchSeqRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const page = await api.listVisitors({ org_id: activeOrgId, name: query.trim(), limit: 8 });
        if (searchSeqRef.current === seq) setResults(page?.data || []);
      } catch {
        if (searchSeqRef.current === seq) setResults([]);
      } finally {
        if (searchSeqRef.current === seq) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [show, visitor, query, api, activeOrgId]);

  const submit = async (e) => {
    e.preventDefault();
    tapLight(); // press tick — the outcome buzz follows the API result
    if (!visitor) {
      setError('Pick a visitor first.');
      return;
    }
    const scheduleError = validateSchedule({ start, end });
    if (scheduleError) {
      setError(scheduleError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createVisit({
        organization_id: activeOrgId,
        location_id: activeScope.locationId,
        building_id: activeScope.buildingId,
        visitor_id: visitor.id,
        start_time: fromDatetimeLocalValue(start),
        ...(end ? { end_time: fromDatetimeLocalValue(end) } : {}),
      });
      let cancelFailed = false;
      if (replaceVisit) {
        try {
          await api.cancelVisit(replaceVisit.id);
        } catch {
          cancelFailed = true;
        }
      }
      notifySuccess();
      if (cancelFailed) {
        flash.warning('New visit scheduled, but the original could not be cancelled — cancel it from the visits list.');
      } else {
        flash.success(replaceVisit
          ? `Visit rescheduled for ${visitor.first_name} ${visitor.last_name}.`
          : `Visit scheduled for ${visitor.first_name} ${visitor.last_name}.`);
      }
      onScheduled?.();
      onClose();
    } catch (err) {
      notifyError();
      setError(getUserFacingError(err, 'save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={saving ? undefined : onClose} centered>
        <Form onSubmit={submit}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title as="h5">{replaceVisit ? 'Reschedule visit' : 'Schedule visit'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            {!scopeReady && (
              <Alert variant="warning" className="mb-3">
                Pick a location and building in your{' '}
                <Link to="/scope" onClick={onClose}>workspace</Link> first — scheduled
                visits are tied to a building.
              </Alert>
            )}

            <Form.Group className="mb-3" controlId="schedule-visitor">
              <Form.Label>Visitor</Form.Label>
              {visitor ? (
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold flex-grow-1 text-truncate">
                    {visitor.first_name} {visitor.last_name}
                    {visitor.status && visitor.status !== 'active' && (
                      <StatusBadge status={visitor.status} />
                    )}
                  </span>
                  {/* Preset visitor (VisitorDetail entry) is fixed — no swap
                      button; searched picks can be changed. */}
                  {!presetVisitor && (
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      disabled={saving}
                      onClick={() => { setVisitor(null); setQuery(''); }}
                    >
                      Change
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <Form.Control
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or email…"
                    autoFocus
                  />
                  {searching && (
                    <div className="text-muted small mt-2">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Searching…
                    </div>
                  )}
                  {results && !searching && (
                    results.length === 0 ? (
                      <div className="text-muted small mt-2">No visitors match.</div>
                    ) : (
                      <ListGroup className="mt-2">
                        {results.map((v) => (
                          <ListGroup.Item
                            key={v.id}
                            action
                            onClick={() => { tapLight(); setVisitor(v); }}
                          >
                            <span className="fw-semibold">{v.first_name} {v.last_name}</span>
                            {v.status && v.status !== 'active' && (
                              <StatusBadge status={v.status} />
                            )}
                            <span className="d-block small text-muted text-truncate">{v.email || v.company || ''}</span>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    )
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 mt-1"
                    onClick={() => setShowNewVisitor(true)}
                  >
                    <i className="fas fa-user-plus me-1" aria-hidden="true" />
                    New visitor…
                  </Button>
                </>
              )}
            </Form.Group>

            <Row className="g-3">
              <Col sm={6}>
                <Form.Group controlId="schedule-start">
                  <Form.Label>Arriving</Form.Label>
                  {/* min ≈ now (floored to the 5-min grid — see minStartValue)
                      with 5-minute stepping (legacy picker parity); the wire
                      would accept a past start, the UI won't. */}
                  <Form.Control
                    type="datetime-local"
                    value={start}
                    min={minStartValue()}
                    step={300}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="schedule-end">
                  <Form.Label>Until <span className="text-muted fw-normal">(optional)</span></Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={end}
                    min={start || undefined}
                    step={300}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving || !scopeReady || !visitor}>
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Scheduling…
                </>
              ) : (
                replaceVisit ? 'Reschedule' : 'Schedule visit'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <VisitorFormModal
        show={showNewVisitor}
        onClose={() => setShowNewVisitor(false)}
        onSaved={(created) => {
          if (created) setVisitor(created);
        }}
      />
    </>
  );
}
