import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Nav, Spinner, Table } from 'react-bootstrap';
import SectionCard from '../../components/SectionCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import PullToRefresh from '../../components/PullToRefresh.jsx';
import { useConfirmModal } from '../../components/ConfirmModal.jsx';
import VisitActionModal from './VisitActionModal.jsx';
import { useApi } from '../../state/useApi.js';
import { useSession } from '../../state/useSession.js';
import { useFlash } from '../../lib/flashProvider.jsx';
import { useScopedPolling } from '../../lib/useScopedPolling.js';
import { getUserFacingError } from '../../lib/userErrors.js';
import { formatDateTime, formatRelative, formatTime } from '../../lib/format/datetime.js';
import { visitEndTime, visitStartTime } from '../../lib/visitTimes.js';
import { hostContactName } from '../../lib/visitHost.js';
import { groupUpcomingVisits, upcomingBucket } from '../../lib/upcomingVisits.js';
import { badgeStatusMap, newlyEncodedReady } from '../../lib/badgePipeline.js';
import { isCheckinGateError } from '../../lib/checkinGate.js';
import { notifyError, notifySuccess, notifyWarning } from '../../lib/native/haptics.js';

// Visit operations, split into the desk's three working modes (scheduled-visits
// plan step 1, docs/scheduled-visits-plan.md): Upcoming (pending arrivals,
// grouped Overdue/Today/Later, soonest first), On site (live), History
// (terminal). A row TAP opens the action modal — a DELIBERATE divergence from
// the web UI's inline row-actions column (owner decision 2026-07-23): this app
// ships to phones/tablets where a tap target beats hover menus. Eligibility
// comes from visitHelpers (ported — do not re-derive per screen). Polls at 15s
// so checking_in → active, badge progress, and new arrivals live on screen.
//
// The comma status values are IN-lists: backend support ships with
// sentinel-datamanager PR #256 (release PR #260, deploying 2026-07-24) —
// before that deploy /v1/visits treated `status` as single-value equality and
// these matched NOTHING (the mock always supported IN-lists, which masked it).
// If this app must ever ship ahead of that backend again, fall back to
// sentinel-ui's pattern (#368/#370): single status on the wire + client-side
// IN-set narrowing.
const VIEWS = [
  // Upcoming fetches a taller page than the live views: the pending backlog
  // for a scope can outgrow a screen, and there is no server-side
  // scheduled_start sort/window to lean on (see lib/upcomingVisits.js).
  { key: 'upcoming', label: 'Upcoming', status: 'pending', limit: 50 },
  { key: 'onsite', label: 'On site', status: 'checking_in,active,checking_out', limit: 30 },
  { key: 'history', label: 'History', status: 'completed,cancelled,failed,expired', limit: 30 },
];

export default function VisitsList() {
  const api = useApi();
  const { activeOrgId, activeScope } = useSession();
  const flash = useFlash();
  const { confirm: askConfirm, ConfirmDialog } = useConfirmModal();
  const [rows, setRows] = useState([]);
  const [visitorsById, setVisitorsById] = useState({});
  // Upcoming is the default on purpose: surfacing scheduled arrivals is the
  // point of this screen's redesign (owner direction 2026-07-24); On site is
  // one tap away.
  const [viewKey, setViewKey] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The visit whose action modal is open (null = closed) + in-flight guard.
  const [activeVisit, setActiveVisit] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const view = VIEWS.find((v) => v.key === viewKey) || VIEWS[0];

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
        limit: view.limit,
        status: view.status,
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
  }, [api, activeOrgId, activeScope, view]);

  useEffect(() => {
    load();
  }, [load]);
  useScopedPolling({
    channel: 'visits-list',
    poll: () => load({ quiet: true }),
    intervalMs: 15_000,
  });

  const visitorName = (v) => {
    const visitor = visitorsById[v.visitor_id];
    // visitor_name rides VisitOut itself — a human name beats the raw id
    // whenever the expand misses (page boundary, tombstoned visitor).
    return visitor ? `${visitor.first_name} ${visitor.last_name}` : (v.visitor_name || v.visitor_id);
  };

  const finishAction = async (message, haptic = notifySuccess) => {
    haptic();
    flash.success(message);
    setActiveVisit(null);
    await load({ quiet: true });
  };

  // Gate failures are expected business outcomes (visitor needs review, no
  // badges, queue full) — warning buzz + the gate's message; real errors get
  // the error buzz. Failure keeps the modal open to retry.
  const failAction = (err, context = 'general') => {
    (isCheckinGateError(err) ? notifyWarning : notifyError)();
    flash.error(getUserFacingError(err, context));
  };

  // Per-visit check-in IS POST /visits/{id}/confirm (wire truth 2026-07-24:
  // 202 → checking_in → async badge pipeline; the visitor-level checkin
  // endpoint cannot target a visit). BACKGROUND_CHECK_REQUIRED (428) is the
  // one clearable gate: prompt, then retry with check_cleared — mirroring the
  // backend's documented body flag. Other gates surface as warnings.
  const checkIn = async (visit) => {
    setActionBusy(true);
    try {
      await api.confirmVisit(visit.id);
      await finishAction('Check-in started.');
    } catch (err) {
      if (err?.code === 'BACKGROUND_CHECK_REQUIRED') {
        notifyWarning();
        const cleared = await askConfirm({
          title: 'Background check required',
          body: `${visitorName(visit)} needs a background check before check-in. Confirm it has been cleared to continue.`,
          confirmLabel: 'Cleared — check in',
          variant: 'primary',
        });
        if (cleared) {
          try {
            await api.confirmVisit(visit.id, { check_cleared: true });
            await finishAction('Check-in started.');
          } catch (retryErr) {
            failAction(retryErr, 'checkin');
          }
        }
      } else {
        failAction(err, 'checkin');
      }
    } finally {
      setActionBusy(false);
    }
  };

  // `onDone` is the success haptic: checkout feels like a completion
  // (Success); cancel is destructive-but-intended (Warning).
  const act = (label, fn, onDone = notifySuccess) => async (visit) => {
    setActionBusy(true);
    try {
      await fn(visit.id);
      await finishAction(`Visit ${label}.`, onDone);
    } catch (err) {
      failAction(err);
    } finally {
      setActionBusy(false);
    }
  };

  const checkout = act('checked out', api.checkoutVisit);
  const cancel = act('cancelled', api.cancelVisit, notifyWarning);

  // Upcoming's schedule cell: today's arrivals read as a clock time plus
  // relative distance ("10:30 AM · in 45 min" / "· 20 min ago" when overdue);
  // other days as a short date. Unscheduled pending records are rare (desk
  // check-ins go straight to checking_in) but must not vanish.
  const scheduledCell = (v) => {
    if (!v.start_time) return <span className="text-muted">Unscheduled</span>;
    if (upcomingBucket(v) === 'later') {
      return formatDateTime(v.start_time, undefined, { length: 'short' });
    }
    const overdue = upcomingBucket(v) === 'overdue';
    return (
      <>
        {formatTime(v.start_time)}
        <span className={overdue ? 'text-danger' : 'text-muted'}>
          {' '}· {formatRelative(v.start_time)}
        </span>
      </>
    );
  };

  const rowProps = (v) => ({
    role: 'button',
    style: { cursor: 'pointer' },
    onClick: () => setActiveVisit(v),
  });

  const upcomingGroups = viewKey === 'upcoming' ? groupUpcomingVisits(rows) : [];

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="fw-bold mb-0">Visits</h4>
      </div>
      <Nav
        variant="pills"
        className="mb-3 flex-nowrap"
        activeKey={viewKey}
        onSelect={(key) => key && setViewKey(key)}
      >
        {VIEWS.map((v) => (
          <Nav.Item key={v.key}>
            <Nav.Link eventKey={v.key}>{v.label}</Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      <PullToRefresh onRefresh={() => load({ quiet: true })} disabled={loading}>
        <SectionCard bodyClassName="p-0">
          {error && <Alert variant="danger" className="m-3">{error}</Alert>}
          {loading ? (
            <div className="text-muted small py-4 text-center">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading visits…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted small py-4 text-center">
              {viewKey === 'upcoming'
                ? 'No upcoming visits in this workspace.'
                : 'No visits match this view.'}
            </div>
          ) : viewKey === 'upcoming' ? (
            <Table hover responsive className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Scheduled</th>
                  <th className="d-none d-sm-table-cell">Host</th>
                </tr>
              </thead>
              <tbody>
                {upcomingGroups.map((group) => (
                  <Fragment key={group.key}>
                    {/* Split header cell (colSpan matches the visible column
                        pair; the spacer hides with the Host column) so the
                        gray band spans the row at every breakpoint. */}
                    <tr className="table-light">
                      <td colSpan={2} className="small fw-semibold text-uppercase text-muted">
                        {group.label} ({group.visits.length})
                      </td>
                      <td className="d-none d-sm-table-cell" />
                    </tr>
                    {group.visits.map((v) => (
                      <tr key={v.id} {...rowProps(v)}>
                        <td className="fw-semibold">{visitorName(v)}</td>
                        <td className="small text-nowrap">{scheduledCell(v)}</td>
                        <td className="small d-none d-sm-table-cell">
                          {hostContactName(v.host_contact) || <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </Table>
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
                  <tr key={v.id} {...rowProps(v)}>
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
      </PullToRefresh>

      {activeVisit && (
        <VisitActionModal
          visit={activeVisit}
          visitorName={visitorName(activeVisit)}
          busy={actionBusy}
          onConfirm={checkIn}
          onCheckout={checkout}
          onCancel={cancel}
          onClose={() => setActiveVisit(null)}
        />
      )}
      {ConfirmDialog}
    </>
  );
}
