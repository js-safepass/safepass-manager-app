// Passive network-connectivity tracker.
//
// Three internal states drive an adaptive polling cadence and a
// probationary "checking" phase that absorbs brief network blips
// without surfacing them to consumers:
//
//   online   — confident connectivity. 60s poll. Public `online: true`.
//   checking — first miss(es). 7s poll. STILL `online: true` externally;
//              this is a debounce window so a single dropped TCP packet
//              or momentary DNS lag never shows the offline chip.
//   offline  — three consecutive misses. 15s poll. Public `online: false`,
//              `showOfflineChip: true`. Chip renders, cleared on first hit.
//
// Public API is intentionally minimal — consumers see `online` and
// `showOfflineChip`, never `checking`. That's a UX/debounce concept;
// external code should react only to confident state.
//
// Connectivity does not gate any behavior — the kiosk continues making
// API calls regardless. Failed calls surface their natural error UX and
// the kiosk keeps trying. This component is informational only.
//
// Browser `online`/`offline` events trigger an immediate probe but never
// directly drive state — we trust our own HEAD probe, not the browser's
// claim (WKWebView's events are notoriously unreliable on iPad).

import { useEffect, useMemo, useRef, useState } from 'react';
import { NetworkContext } from './useNetwork.js';

// Cloudflare-controllable kill switch for the visible/active half of the
// feature. Set `VITE_NETWORK_AWARE_RECOVERY=true` in the Cloudflare Pages
// environment to enable. When unset (or anything other than 'true'):
//   - No background polling fires (no probe traffic)
//   - The offline chip never renders
//   - `online` is forced true so the restore-validate effect's
//     online-transition re-trigger stays inert (no spurious churn)
//
// Independent of this flag, the always-on resilience improvements that
// landed alongside this feature remain active:
//   - Restore-validate preserves persisted creds on transient errors
//   - App.jsx's 30s "Log out" affordance arms on any stuck restore overlay
// Those don't depend on connectivity polling and don't need a kill switch.
// Default OFF — explicit opt-in only.
const NETWORK_AWARE_ENABLED = import.meta.env.VITE_NETWORK_AWARE_RECOVERY === 'true';

const PROBE_TIMEOUT_MS = 5_000;
const POLL_MS = {
  online: 60_000,
  checking: 7_000,
  offline: 15_000,
};
// Consecutive misses required before transitioning checking → offline.
// With 7s checking-poll, that's ~14-21s from first miss to chip appearance.
const MISS_THRESHOLD = 3;

async function probe() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function NetworkProvider({ children }) {
  // Optimistic start — the initial mount probe corrects this within ~5s
  // if connectivity is actually missing.
  const [status, setStatus] = useState('online');
  const missCountRef = useRef(0);

  useEffect(() => {
    // Feature kill switch — skip all polling, event listeners, state
    // transitions. `status` stays at the optimistic 'online' default so
    // consumers see `online: true` and `showOfflineChip: false` for the
    // lifetime of the provider.
    if (!NETWORK_AWARE_ENABLED) return undefined;

    let mounted = true;
    let timeoutId = null;

    // One probe cycle: hit the server, update state, schedule next tick
    // using the cadence that matches the new state.
    const tick = async () => {
      const ok = await probe();
      if (!mounted) return;

      let nextStatus;
      if (ok) {
        missCountRef.current = 0;
        nextStatus = 'online';
      } else {
        missCountRef.current += 1;
        nextStatus = missCountRef.current >= MISS_THRESHOLD ? 'offline' : 'checking';
      }
      setStatus(nextStatus);

      timeoutId = setTimeout(tick, POLL_MS[nextStatus]);
    };

    // Initial probe — fires immediately on mount so we don't sit on the
    // optimistic 'online' default longer than necessary.
    tick();

    // Browser events: trigger an immediate probe (cancelling the pending
    // timer) but don't drive state directly. Lets us react quickly to OS
    // signals while still using our own probe result as truth.
    const wakeProbe = () => {
      if (timeoutId) clearTimeout(timeoutId);
      tick();
    };
    window.addEventListener('online', wakeProbe);
    window.addEventListener('offline', wakeProbe);

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('online', wakeProbe);
      window.removeEventListener('offline', wakeProbe);
    };
  }, []);

  const value = useMemo(() => ({
    // True iff the feature is opted in via VITE_NETWORK_AWARE_RECOVERY.
    // Consumers that have a "pre-feature" fallback (e.g. restore-validate
    // wipe-on-any-error) read this to decide which branch to take.
    enabled: NETWORK_AWARE_ENABLED,
    // `online` is true in BOTH `online` and `checking` states — the
    // checking phase is debounce-internal and consumers should not see
    // a connectivity flap from a single missed probe. Also forced true
    // when feature is disabled (no signal to drive it).
    online: !NETWORK_AWARE_ENABLED || status !== 'offline',
    // Only true when we're confident enough to surface the chip AND the
    // feature is enabled.
    showOfflineChip: NETWORK_AWARE_ENABLED && status === 'offline',
  }), [status]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
