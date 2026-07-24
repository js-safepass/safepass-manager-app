import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VisitorFormModal from './VisitorFormModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { getUserFacingError } from '../../lib/userErrors.js';
import { tapLight } from '../../lib/native/haptics.js';
import { presenceFor, presenceFromVisits } from '../../lib/visitorPresence.js';

// Visitor directory: server-filtered, keyset-paginated (opaque meta.cursor;
// its absence — never page size — is the end signal). Filter changes discard
// the cursor and restart the walk, per the pagination contract.
export default function VisitorsList() {
  const api = useApi();
  const { activeOrgId } = useSession();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [filters, setFilters] = useState({ name: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Live presence join (owner feedback 2026-07-23): the Visitor record has
  // no live check-in state — it exists only as the current visit's status —
  // so fetch on-site visits once per page load and join client-side
  // (lib/visitorPresence.js). Best-effort: a failure just renders everyone
  // off-site rather than blocking the directory.
  const [presence, setPresence] = useState(() => presenceFromVisits([]));

  const load = useCallback(async ({ append = false, cursor: cur } = {}) => {
    const setBusy = append ? setLoadingMore : setLoading;
    setBusy(true);
    setError(null);
    try {
      const page = await api.listVisitors({
        org_id: activeOrgId,
        limit: 15,
        name: filters.name || undefined,
        status: filters.status || undefined,
        cursor: cur || undefined,
      });
      setRows((prev) => (append ? [...prev, ...(page?.data || [])] : page?.data || []));
      setCursor(page?.meta?.cursor || null);
      if (!append) {
        // Comma status = IN-list; needs backend PR #256 (release #260,
        // deployed 2026-07-24) — see lib/visitorPresence.js header.
        api.listVisits({ org_id: activeOrgId, status: 'checking_in,active,checking_out', limit: 200 })
          .then((res) => setPresence(presenceFromVisits(res?.data)))
          .catch(() => {});
      }
    } catch (err) {
      setError(getUserFacingError(err, 'load'));
    } finally {
      setBusy(false);
    }
  }, [api, activeOrgId, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0">Visitors</h4>
        <Button variant="primary" onClick={() => { tapLight(); setShowCreate(true); }}>
          <i className="fas fa-plus me-2" aria-hidden="true" />
          Add visitor
        </Button>
      </div>

      <SectionCard bodyClassName="p-0">
        <Row className="g-2 p-3 border-bottom">
          <Col md={5}>
            <Form.Control
              placeholder="Search name or email…"
              value={filters.name}
              onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
              aria-label="Search visitors"
            />
          </Col>
          <Col md={3}>
            <Form.Select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_review">Pending review</option>
              <option value="archived">Archived</option>
            </Form.Select>
          </Col>
        </Row>

        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <div className="text-muted small py-4 text-center">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading visitors…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted small py-4 text-center">
            No visitors match these filters.
          </div>
        ) : (
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Name</th>
                <th className="d-none d-md-table-cell">Company</th>
                <th className="d-none d-sm-table-cell">Type</th>
                {/* Presence (live check-in state from on-site visits) is THE
                    status column now (owner feedback 2026-07-23); lifecycle
                    status is a record property, shown as a secondary badge on
                    the name only when notable (pending review / archived). */}
                <th>Presence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const live = presenceFor(presence, v.id);
                return (
                  <tr
                    key={v.id}
                    role="button"
                    onClick={() => navigate(`/visitors/${v.id}`)}
                  >
                    <td>
                      <div className="fw-semibold d-flex align-items-center gap-2">
                        {v.first_name} {v.last_name}
                        {v.status && v.status !== 'active' && <StatusBadge status={v.status} />}
                      </div>
                      <div className="text-muted small">{v.email}</div>
                    </td>
                    <td className="d-none d-md-table-cell">{v.company}</td>
                    <td className="d-none d-sm-table-cell text-capitalize">{v.type}</td>
                    <td>
                      {live
                        ? <Badge bg={live.variant}>{live.label}</Badge>
                        : <span className="text-muted small">Off site</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {cursor && !loading && (
          <div className="p-3 border-top text-center">
            <Button
              variant="outline-primary"
              size="sm"
              disabled={loadingMore}
              onClick={() => load({ append: true, cursor })}
            >
              {loadingMore ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading…
                </>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </SectionCard>

      <VisitorFormModal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(created) => created && navigate(`/visitors/${created.id}`)}
      />
    </>
  );
}
