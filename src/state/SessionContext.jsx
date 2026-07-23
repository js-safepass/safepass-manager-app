import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './useApi.js';
import { useFlash } from '../lib/flashProvider.jsx';
import { getUserFacingError } from '../lib/userErrors.js';
import { classifyWhoami, whoamiOrgIds } from '../lib/whoami.js';
import { SessionContext } from './useSession.js';

// Persisted org selection — same key sentinel-ui uses, deliberately, so the
// convention is recognizable across SafePass apps (localStorage is
// per-origin, so the apps never actually collide).
const ACTIVE_ORG_KEY = 'safepass.activeOrgId';
// Per-org sub-scope (division/location/building picked in the ScopePicker
// drill-down) — same key convention as sentinel-ui's scopeProvider.
const scopeKeyFor = (orgId) => `safepass.scope.${orgId}`;

function readStoredScope(orgId) {
  if (!orgId) return null;
  try {
    const raw = window.localStorage.getItem(scopeKeyFor(orgId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredOrgId() {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY) || null;
  } catch {
    return null;
  }
}

// Session bootstrap after sign-in, mirroring sentinel-ui's sessionProvider
// semantics at v1 scale: hydrate from GET /v1/whoami (authorization truth is
// server-side — never inferred from local UI state), tolerate the
// provisional /v1/auth/scopes shape, reconcile the persisted org selection
// against the granted orgs, and expose a no-access state instead of letting
// screens retry into a wall. `sessionStatus` is monotonic once 'ready'.
export function SessionProvider({ children }) {
  const api = useApi();
  const flash = useFlash();
  const [whoami, setWhoami] = useState(null);
  const [scopes, setScopes] = useState(null);
  // loading | ready | no_access | error
  const [sessionStatus, setSessionStatus] = useState('loading');
  const [sessionError, setSessionError] = useState(null);
  const [activeOrgId, setActiveOrgIdState] = useState(readStoredOrgId);
  // Sub-org scope from the drill-down (ids + display names), keyed per org.
  const [activeScope, setActiveScopeState] = useState(() => readStoredScope(readStoredOrgId()));
  const readyOnceRef = useRef(false);

  const setActiveScope = useCallback((scope) => {
    setActiveScopeState(scope || null);
    const orgId = window.localStorage.getItem(ACTIVE_ORG_KEY);
    try {
      if (orgId && scope) window.localStorage.setItem(scopeKeyFor(orgId), JSON.stringify(scope));
      else if (orgId) window.localStorage.removeItem(scopeKeyFor(orgId));
    } catch {
      // Storage unavailable — selection just won't persist.
    }
  }, []);

  const setActiveOrgId = useCallback((orgId) => {
    setActiveOrgIdState(orgId);
    // Scope is per-org: switching orgs swaps in that org's persisted scope.
    setActiveScopeState(readStoredScope(orgId));
    try {
      if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      else window.localStorage.removeItem(ACTIVE_ORG_KEY);
    } catch {
      // Storage unavailable (private mode) — selection just won't persist.
    }
  }, []);

  const load = useCallback(async () => {
    if (!readyOnceRef.current) setSessionStatus('loading');
    setSessionError(null);
    try {
      const who = await api.whoami();
      const data = who?.data || null;
      setWhoami(data);

      const kind = classifyWhoami(data);

      // Scope catalog is PROVISIONAL in the spec — fetch it, but never let
      // its failure block the session.
      api.listAuthScopes()
        .then((res) => setScopes(res?.data ?? null))
        .catch(() => setScopes(null));

      const orgIds = whoamiOrgIds(data);
      if (kind === 'no_access') {
        setSessionStatus('no_access');
        return;
      }
      // Reconcile the persisted selection against what's actually granted.
      setActiveOrgIdState((current) => {
        const next = current && orgIds.includes(current) ? current : orgIds[0];
        try {
          window.localStorage.setItem(ACTIVE_ORG_KEY, next);
        } catch {
          // Non-fatal.
        }
        return next;
      });
      readyOnceRef.current = true;
      setSessionStatus('ready');
    } catch (err) {
      if (readyOnceRef.current) return; // post-ready blips don't demote the session
      setSessionError(getUserFacingError(err, 'load'));
      setSessionStatus('error');
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // Reconcile the persisted sub-scope once per session (scope-spec Q-A, fleet
  // contract): a tier that no longer exists (renamed org structure, revoked
  // grant) walks the chain UP to the nearest valid point — with a toast — so
  // screens never filter against a dead id and silently show empty lists.
  // Location is validated before building (an invalid location invalidates
  // its buildings); division is display-only and never filters, so a stale
  // one rides along harmlessly until the next re-pick. Transient fetch
  // failures leave the scope untouched (validated again next session).
  const scopeValidatedRef = useRef(false);
  useEffect(() => {
    if (sessionStatus !== 'ready' || scopeValidatedRef.current) return;
    if (!activeOrgId || !activeScope || (!activeScope.locationId && !activeScope.buildingId)) {
      scopeValidatedRef.current = true;
      return;
    }
    scopeValidatedRef.current = true;
    (async () => {
      try {
        const next = { ...activeScope };
        let walked = false;
        if (next.locationId) {
          const res = await api.listLocations(activeOrgId, { limit: 200 });
          if (!(res?.data || []).some((l) => l.id === next.locationId)) {
            delete next.locationId; delete next.locationName;
            delete next.buildingId; delete next.buildingName; // children of a dead tier
            walked = true;
          }
        }
        if (!walked && next.buildingId) {
          const res = await api.listBuildings(activeOrgId, { limit: 200 });
          if (!(res?.data || []).some((b) => b.id === next.buildingId)) {
            delete next.buildingId; delete next.buildingName;
            walked = true;
          }
        }
        if (walked) {
          const hasTiers = next.divisionId || next.locationId || next.buildingId;
          setActiveScope(hasTiers ? next : null);
          flash.warning('Part of your saved workspace scope is no longer available — it was reset to the nearest valid level.');
        }
      } catch {
        // Transient — keep the scope; next session re-validates.
      }
    })();
  }, [sessionStatus, activeOrgId, activeScope, api, setActiveScope, flash]);

  const value = useMemo(
    () => ({
      whoami,
      scopes,
      sessionStatus,
      sessionError,
      activeOrgId,
      setActiveOrgId,
      activeScope,
      setActiveScope,
      orgIds: whoamiOrgIds(whoami),
      scopeLabel: whoami?.scope_label || '',
      membershipVersion: whoami?.membership_version || null,
      refreshSession: load,
    }),
    [whoami, scopes, sessionStatus, sessionError, activeOrgId, setActiveOrgId, activeScope, setActiveScope, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
