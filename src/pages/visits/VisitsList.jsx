import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Form, Spinner, Table } from 'react-bootstrap';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VisitActionModal from './VisitActionModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { useScopedPolling } from '../../lib/useScopedPolling.js';
import { getUserFacingError } from '../../lib/userErrors.js';
import { formatDateTime } from '../../lib/format/datetime.js';
import { visitEndTime, visitStartTime } from '../../lib/visitTimes.js';
import { badgeStatusMap, newlyEncodedReady } from '../../lib/badgePipeline.js';
import { notifyError, notifySuccess, notifyWarning } from '../../lib/native/haptics.js';

// Visit operations: live list, columns Visitor | Status | Start | End, and a
// row TAP opens the action modal (VisitActionModal) — a DELIBERATE divergence
// from the web UI's inline row-actions column (owner decision 2026-07-23):
// this app ships to phones/tablets where a tap target beats hover menus.
// Eligibility comes from visitHelpers (ported — do not re-derive per screen).
// Polls at 15s so checking_in → active and badge progress live on screen.
export default function VisitsList() {
  const api = useApi();
  const { activeOrgId, activeScope } = useSession();
  const flash = useFlash();
  const [rows, setRows] = useState([]);
  const [visitorsById, setVisitorsById] = useState({});
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The visit whose action modal is open (null = closed) + in-flight guard.
  const [activeVisit, setActiveVisit] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Previous poll's badge statuses, for the completion transition below.
  // A ref (not state): each poll compares-and-swaps; no render depends on it.
  const badgeStatusesRef = useRef(new Map());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      // Narrow to the picked workspace scope. /visits filters on
      // location_id/building_id only — division_id is NOT a supported filter
      // (backend parseVisitListFilters, verified 2026-07-23), so a
      // division-only scope intentionally shows the whole org. The expand key
      // is plural 'visitors' (backend expandHas is an exact match; the
      // singular silently no-ops). Unpicked levels stay undefined.
      const page = await api.listVisits({
        org_id: activeOrgId,
        location_id: activeScope?.locationId || undefined,
        building_id: activeScope?.buildingId || undefined,
        limit: 30,
        status: statusFilter || undefined,
        expand: 'visitors',
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
      // Keep the open action modal's visit fresh across polls (its status /
      // badge fields update live); if the visit left this filtered page, the
      // modal closes rather than acting on a stale record.
      setActiveVisit((prev) => (prev ? visits.find((x) => x.id === prev.id) || null : prev));
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
  // (Success); cancel is destructive-but-intended (Warning). Actions fire
  // from the row modal; success closes it, failure keeps it open to retry.
  const act = (label, fn, onDone = notifySuccess) => async (visit) => {
    setActionBusy(true);
    try {
      await fn(visit.id);
      onDone();
      flash.success(`Visit ${label}.`);
      setActiveVisit(null);
      await load({ quiet: true });
    } catch (err) {
      notifyError();
      flash.error(getUserFacingError(err));
    } finally {
      setActionBusy(false);
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
                <th>Status</th>
                {/* Always visible (owner feedback 2026-07-23 — phones were
                    dropping to a two-column table); short format keeps them
                    narrow enough for 360px. */}
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.id}
                  role="button"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveVisit(v)}
                >
                  <td className="fw-semibold">{visitorName(v)}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="small text-nowrap">
                    {formatDateTime(visitStartTime(v), undefined, { length: 'short' }) || '—'}
                  </td>
                  <td className="small text-nowrap">
                    {visitEndTime(v)
                      ? formatDateTime(visitEndTime(v), undefined, { length: 'short' })
                      : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {activeVisit && (
        <VisitActionModal
          visit={activeVisit}
          visitorName={visitorName(activeVisit)}
          busy={actionBusy}
          onConfirm={confirm}
          onCheckout={checkout}
          onCancel={cancel}
          onClose={() => setActiveVisit(null)}
        />
      )}
    </>
  );
}
