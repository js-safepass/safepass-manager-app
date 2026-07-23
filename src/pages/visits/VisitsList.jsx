import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Form, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import RowActions from '../../components/RowActions.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { useScopedPolling } from '../../lib/useScopedPolling.js';
import { getUserFacingError } from '../../lib/userErrors.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { isCheckoutEligible, isConfirmEligible } from '../../lib/visitHelpers.js';
import { badgeStatus, badgeStatusMap, newlyEncodedReady } from '../../lib/badgePipeline.js';
import { notifyError, notifySuccess, notifyWarning } from '../../lib/native/haptics.js';

// Visit operations: live list with lifecycle actions. Eligibility comes from
// visitHelpers (ported — do not re-derive per screen). Polls at 15s so
// checking_in → active and the badge pipeline progress live on screen.
export default function VisitsList() {
  const api = useApi();
  const { activeOrgId, activeScope } = useSession();
  const flash = useFlash();
  const [rows, setRows] = useState([]);
  const [visitorsById, setVisitorsById] = useState({});
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Previous poll's badge statuses, for the completion transition below.
  // A ref (not state): each poll compares-and-swaps; no render depends on it.
  const badgeStatusesRef = useRef(new Map());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      // Narrow to the picked workspace scope (spec: /visits accepts
      // division/location/building filters). Unpicked levels stay undefined.
      const page = await api.listVisits({
        org_id: activeOrgId,
        division_id: activeScope?.divisionId || undefined,
        location_id: activeScope?.locationId || undefined,
        building_id: activeScope?.buildingId || undefined,
        limit: 30,
        status: statusFilter || undefined,
        expand: 'visitor',
      });
      const visits = page?.data || [];
      // Badge completion is a background transition observed between polls
      // (not an action callback) — buzz once when a badge becomes ready.
      // First sighting stays silent (newlyEncodedReady contract), and the
      // poll pauses when hidden, so this can't fire on a background tab.
      if (newlyEncodedReady(badgeStatusesRef.current, visits).length > 0) {
        notifySuccess();
      }
      badgeStatusesRef.current = badgeStatusMap(visits);
      setRows(visits);
      setVisitorsById((prev) => ({ ...prev, ...(page?.includes?.visitors || {}) }));
      setError(null);
    } catch (err) {
      setError(getUserFacingError(err, 'load'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [api, activeOrgId, activeScope, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);
  useScopedPolling({
    channel: 'visits-list',
    poll: () => load({ quiet: true }),
    intervalMs: 15_000,
  });

  // `onDone` is the success haptic: confirm/checkout feel like completions
  // (Success); cancel is destructive-but-intended (Warning).
  const act = (label, fn, onDone = notifySuccess) => async (visit) => {
    try {
      await fn(visit.id);
      onDone();
      flash.success(`Visit ${label}.`);
      await load({ quiet: true });
    } catch (err) {
      notifyError();
      flash.error(getUserFacingError(err));
    }
  };

  const confirm = act('confirmed', api.confirmVisit);
  const checkout = act('checked out', api.checkoutVisit);
  const cancel = act('cancelled', api.cancelVisit, notifyWarning);

  const visitorName = (v) => {
    const visitor = visitorsById[v.visitor_id];
    return visitor ? `${visitor.first_name} ${visitor.last_name}` : v.visitor_id;
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0">Visits</h4>
        <Form.Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ maxWidth: 220 }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="checking_in,active,checking_out">On site</option>
          <option value="completed">Completed</option>
          <option value="cancelled,failed,expired">Cancelled / failed</option>
        </Form.Select>
      </div>

      <SectionCard bodyClassName="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <div className="text-muted small py-4 text-center">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading visits…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted small py-4 text-center">No visits match this filter.</div>
        ) : (
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Visitor</th>
                <th className="d-none d-md-table-cell">Started</th>
                <th>Status</th>
                <th className="d-none d-sm-table-cell">Badge</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link to={`/visitors/${v.visitor_id}`} className="fw-semibold text-decoration-none">
                      {visitorName(v)}
                    </Link>
                  </td>
                  <td className="d-none d-md-table-cell">{formatDateTime(v.scheduled_start || v.created_at)}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="d-none d-sm-table-cell"><StatusBadge status={badgeStatus(v)} /></td>
                  <td className="text-end">
                    <RowActions
                      actions={[
                        {
                          key: 'confirm',
                          label: 'Confirm',
                          icon: 'fas fa-check',
                          show: isConfirmEligible(v),
                          onClick: () => confirm(v),
                        },
                        {
                          key: 'checkout',
                          label: 'Check out',
                          icon: 'fas fa-arrow-right-from-bracket',
                          show: isCheckoutEligible(v),
                          onClick: () => checkout(v),
                        },
                        {
                          key: 'cancel',
                          label: 'Cancel',
                          icon: 'fas fa-ban',
                          variant: 'danger',
                          show: v.status === 'pending',
                          onClick: () => cancel(v),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
