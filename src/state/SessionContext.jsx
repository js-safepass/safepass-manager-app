import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './useApi.js';
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
