import { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { getUserFacingError } from '../../lib/userErrors.js';

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', company: '', type: 'guest', notes: '' };

// Create/edit visitor form. Edit sends If-Match with the record's integer
// version (concurrency contract); create relies on the client's automatic
// Idempotency-Key. Host attach and photo enrollment join this form in their
// own phases.
export default function VisitorFormModal({ show, visitor, onClose, onSaved }) {
  const api = useApi();
  const { activeOrgId } = useSession();
  const flash = useFlash();
  const isEdit = Boolean(visitor?.id);
  const [fields, setFields] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (show) {
      setFields(visitor ? { ...EMPTY, ...visitor } : EMPTY);
      setError(null);
    }
  }, [show, visitor]);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email,
      phone: fields.phone,
      company: fields.company,
      type: fields.type,
      notes: fields.notes,
    };
    try {
      const saved = isEdit
        ? await api.updateVisitor(visitor.id, payload, { ifMatch: visitor.version })
        : await api.createVisitor({ ...payload, org_id: activeOrgId });
      flash.success(isEdit ? 'Visitor updated.' : 'Visitor created.');
      onSaved?.(saved?.data);
      onClose();
    } catch (err) {
      setError(getUserFacingError(err, 'save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={saving ? undefined : onClose} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title as="h5">{isEdit ? 'Edit visitor' : 'Add visitor'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Row className="g-3">
            <Col sm={6}>
              <Form.Group controlId="visitor-first-name">
                <Form.Label>First name</Form.Label>
                <Form.Control value={fields.first_name} onChange={set('first_name')} required autoFocus />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="visitor-last-name">
                <Form.Label>Last name</Form.Label>
                <Form.Control value={fields.last_name} onChange={set('last_name')} required />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="visitor-email">
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={fields.email} onChange={set('email')} />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="visitor-phone">
                <Form.Label>Phone</Form.Label>
                <Form.Control value={fields.phone} onChange={set('phone')} />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="visitor-company">
                <Form.Label>Company</Form.Label>
                <Form.Control value={fields.company} onChange={set('company')} />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="visitor-type">
                <Form.Label>Type</Form.Label>
                <Form.Select value={fields.type} onChange={set('type')}>
                  <option value="guest">Guest</option>
                  <option value="contractor">Contractor</option>
                  <option value="vendor">Vendor</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="visitor-notes">
                <Form.Label>Notes</Form.Label>
                <Form.Control as="textarea" rows={2} value={fields.notes} onChange={set('notes')} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving…
              </>
            ) : (
              isEdit ? 'Save changes' : 'Create visitor'
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
