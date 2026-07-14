// Scope selection: a top-down drill — organization → division → location →
// building — that AUTO-SELECTS any level with a single option and only
// prompts when there's a real choice. Above the building level, single-option
// levels are skipped silently; BUILDING is always shown (the terminal here —
// this app has no floors; the operator confirms exactly which building they
// work). A breadcrumb lets them go back up and change any earlier choice,
// cascading the lower selections away.
//
// The decision logic (auto-select, parent filtering, cascade reset) is the
// framework-free, unit-tested src/lib/scopeHierarchy.js, ported verbatim from
// the mapping app — this component only fetches and renders.
//
// Built from the divisions/locations/buildings LIST endpoints (stable,
// x-apps: shared) composed client-side, NOT /scope-tree (provisional, unused
// by the shipped web UI). Manager lists are keyset-paginated, so each level
// is drained through listAllPages before the pure core sees a flat array.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, ListGroup, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import SectionCard from '../components/SectionCard.jsx';
import { useApi } from '../state/useApi.js';
import { useSession } from '../state/useSession.js';
import { useFlash } from '../lib/flashProvider.jsx';
import { getUserFacingError } from '../lib/userErrors.js';
import { flattenErrorForLog } from '../lib/errorLog.js';
import { listAllPages } from '../lib/listAllPages.js';
import { chooseScope, resolveScope, selectionUpTo } from '../lib/scopeHierarchy.js';

// Ordered scope levels below the org. `items` is injected from the fetched
// lists. autoSelectSingle=false on building => always present its picker.
// (The mapping app appends a floor level; manager terminates at building.)
function buildLevels(data) {
  return [
    { key: 'division', label: 'Division', items: data.divisions, parentKey: null, parentField: null, nameField: 'name', autoSelectSingle: true },
    { key: 'location', label: 'Location', items: data.locations, parentKey: 'division', parentField: 'division_id', nameField: 'name', autoSelectSingle: true },
    { key: 'building', label: 'Building', items: data.buildings, parentKey: 'location', parentField: 'location_id', nameField: 'name', autoSelectSingle: false },
  ];
}

const EMPTY_DATA = { divisions: [], locations: [], buildings: [] };

export default function ScopePicker() {
  const api = useApi();
  const flash = useFlash();
  const navigate = useNavigate();
  // Org level is owned by SessionContext (persisted activeOrgId) — the drill
  // aligns with it instead of duplicating org state.
  const { orgIds, activeOrgId, setActiveOrgId, scopeLabel, activeScope, setActiveScope } = useSession();

  const [phase, setPhase] = useState('loading'); // loading | error | org | scope
  const [message, setMessage] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [selection, setSelection] = useState({});
  const [focusKey, setFocusKey] = useState(null); // level the user jumped back to via breadcrumb
  const [attempt, setAttempt] = useState(0); // bump to retry the fetch

  const retry = () => { setPhase('loading'); setAttempt((n) => n + 1); };

  // whoami carries org ids but only the active org's name (scope_label); fall
  // back to the id for any others.
  const orgOptions = useMemo(
    () => orgIds.map((id) => ({ id, name: id === activeOrgId ? (scopeLabel || id) : id })),
    [orgIds, activeOrgId, scopeLabel],
  );

  // Fetch the org's scope lists. Divisions/locations are OPTIONAL (an org may
  // not use them) — a failure there collapses those tiers rather than
  // blocking; buildings are required and their failure surfaces as an error.
  useEffect(() => {
    if (!activeOrgId) return undefined;
    let cancelled = false;
    (async () => {
      setPhase('loading');
      try {
        const drain = (fetcher) =>
          listAllPages(({ limit, cursor }) => fetcher(activeOrgId, { limit, cursor }));
        const optional = (fetcher) => drain(fetcher).catch(() => []);
        const [divisions, locations, buildings] = await Promise.all([
          optional(api.listDivisions),
          optional(api.listLocations),
          drain(api.listBuildings),
        ]);
        if (cancelled) return;
        setSelection({});
        setFocusKey(null);
        setData({ divisions, locations, buildings });
        setPhase('scope');
      } catch (error) {
        if (cancelled) return;
        // Always log the real error — the specific code (e.g.
        // APP_POLICY_DENIED) isn't surfaced verbatim but must stay diagnosable.
        console.warn('[scope] fetch failed', flattenErrorForLog(error));
        // 401/403 on a fresh sign-in isn't an expired session — the backend
        // rejected a valid token (audience/policy). Say that, not the
        // loop-inducing "sign in again".
        if (error?.status === 401 || error?.status === 403) {
          setMessage('You signed in, but the SafePass API rejected this account\'s access. '
            + 'If this app was just set up, the backend may not have authorized its app client yet.');
        } else {
          setMessage(getUserFacingError(error, 'load'));
        }
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [api, activeOrgId, attempt]);

  const levels = useMemo(() => buildLevels(data), [data]);
  const scope = useMemo(
    () => resolveScope(levels, selection, { focusKey }),
    [levels, selection, focusKey],
  );

  const nameOf = (levelKey, item) => {
    const lvl = levels.find((l) => l.key === levelKey);
    return item?.[lvl?.nameField || 'name'] ?? item?.id ?? '';
  };

  // Terminal reached (a building picked) → persist to the session and return
  // to the workspace.
  const pick = (levelKey, id) => {
    const nextSel = chooseScope(levels, selection, levelKey, id);
    const next = resolveScope(levels, nextSel);
    if (next.complete && next.selectedItems.building) {
      const items = next.selectedItems;
      setActiveScope({
        divisionId: next.resolved.division ?? null,
        divisionName: items.division ? nameOf('division', items.division) : null,
        locationId: next.resolved.location ?? null,
        locationName: items.location ? nameOf('location', items.location) : null,
        buildingId: next.resolved.building,
        buildingName: nameOf('building', items.building),
      });
      flash.success(`Scope set to ${nameOf('building', items.building)}.`);
      navigate('/dashboard');
      return;
    }
    setFocusKey(null); // choice made — let downstream levels auto-select again
    setSelection(nextSel);
  };

  // Jump back to a level's picker via the breadcrumb (forces its selector
  // even if it's a lone auto-selectable option), clearing that level & below.
  const jumpTo = (levelKey) => {
    setSelection(selectionUpTo(levels, selection, levelKey));
    setFocusKey(levelKey);
  };

  const changeOrg = () => {
    setData(EMPTY_DATA);
    setSelection({});
    setFocusKey(null);
    setPhase('org');
  };

  const chooseOrg = (orgId) => {
    if (orgId !== activeOrgId) {
      setActiveOrgId(orgId); // swaps in that org's persisted scope too
    }
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  // Breadcrumb: org + every RESOLVED level. Every crumb is clickable — it
  // jumps back to that level's selector (even a lone auto-selected option).
  const crumbs = [];
  if (activeOrgId) {
    crumbs.push({ key: '__org', label: 'Organization', name: scopeLabel || activeOrgId, onClick: changeOrg });
  }
  for (const step of scope.steps) {
    if (step.selectedId == null) break; // reached the active/unresolved step
    crumbs.push({
      key: step.key,
      label: step.label,
      name: nameOf(step.key, step.selectedItem),
      onClick: () => jumpTo(step.key),
    });
  }

  const activeStep = scope.activeKey ? scope.steps.find((s) => s.key === scope.activeKey) : null;

  return (
    <div className="mx-auto" style={{ maxWidth: 560 }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0">Workspace scope</h4>
        {activeScope && (
          <Button variant="link" size="sm" className="p-0" onClick={() => navigate('/dashboard')}>
            Keep current
          </Button>
        )}
      </div>

      {phase === 'loading' && (
        <div className="text-muted small py-3">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading scope options…
        </div>
      )}

      {phase === 'error' && (
        <>
          <Alert variant="danger">{message}</Alert>
          <Button variant="outline-secondary" size="sm" onClick={retry}>Try again</Button>
        </>
      )}

      {/* Breadcrumb of resolved selections (scope phase only). */}
      {phase === 'scope' && crumbs.length > 0 && (
        <nav aria-label="Scope" className="d-flex flex-wrap align-items-center gap-1 mb-3 small">
          {crumbs.map((c, i) => (
            <span key={c.key} className="d-inline-flex align-items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="text-muted">›</span>}
              <Button
                variant="link"
                size="sm"
                className="p-0"
                onClick={c.onClick}
                title={`Change ${c.label.toLowerCase()}`}
              >
                {c.name}
              </Button>
            </span>
          ))}
        </nav>
      )}

      {/* Org picker (multiple orgs, or via the breadcrumb). */}
      {phase === 'org' && (
        <SectionCard title="Choose an organization" bodyClassName="p-0">
          <ListGroup variant="flush">
            {orgOptions.map((o) => (
              <ListGroup.Item action key={o.id} onClick={() => chooseOrg(o.id)}>
                <i className="fas fa-building me-2 text-primary" aria-hidden="true" />
                {o.name}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </SectionCard>
      )}

      {/* Active scope step. */}
      {phase === 'scope' && activeStep && (
        <SectionCard title={`Choose a ${activeStep.label.toLowerCase()}`} bodyClassName="p-0">
          {activeStep.options.length === 0 ? (
            <div className="text-muted small py-3 text-center">
              No {activeStep.label.toLowerCase()}s are set up here yet.
            </div>
          ) : (
            <ListGroup variant="flush">
              {activeStep.options.map((opt) => (
                <ListGroup.Item action key={opt.id} onClick={() => pick(activeStep.key, opt.id)}>
                  <i
                    className={`fas ${activeStep.key === 'building' ? 'fa-building' : 'fa-sitemap'} me-2 text-primary`}
                    aria-hidden="true"
                  />
                  {nameOf(activeStep.key, opt)}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </SectionCard>
      )}

      {/* Fully resolved with nothing to pick (single building auto-path can't
          happen — building always prompts — but an org with zero buildings
          resolves to an empty picker handled above). */}
    </div>
  );
}
