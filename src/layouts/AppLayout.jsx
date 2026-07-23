import { useEffect, useRef, useState } from 'react';
import { Badge } from 'react-bootstrap';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../state/useSession.js';
import { useNotifications } from '../state/useNotifications.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { checkForDeployedUpdate, UPDATE_CHECK_INTERVAL_MS } from '../lib/appUpdate.js';
import { onAppStateChange } from '../lib/native/app-lifecycle.js';
import { isNative } from '../lib/platform.js';
import BottomNav from '../components/BottomNav.jsx';
import { NAV_ITEMS } from './navItems.js';

function NavItems() {
  const { unreadCount } = useNotifications();
  return (
    <ul className="nav flex-column app-sidebar-nav">
      {NAV_ITEMS.map((item) => (
        <li className="nav-item" key={item.to}>
          <NavLink to={item.to} className="nav-link d-flex align-items-center gap-2">
            <i className={`fas ${item.icon} fa-fw`} aria-hidden="true" />
            <span className="flex-grow-1">{item.label}</span>
            {item.to === '/notifications' && unreadCount > 0 ? (
              <Badge bg="primary" pill>{unreadCount}</Badge>
            ) : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function SidebarBrand() {
  return (
    <div className="app-sidebar-brand d-flex align-items-center gap-2 px-3">
      <i className="fas fa-shield-halved" aria-hidden="true" />
      <span className="fw-bold">SafePass Manager</span>
    </div>
  );
}

// App shell: fixed navy sidebar (≥lg). Below lg the sidebar gives way to an
// always-open bottom tab bar (components/BottomNav.jsx) — thumb-reachable
// primary nav mirroring the mapping app, so there is no drawer to open. Key
// chrome stays pinned (sticky topbar, fixed bottom nav) and content scrolls
// between them. Sidebar look follows sentinel-ui's design tokens (260px,
// --safepass-primary-dark navy, white-on-8%-white active state).
export default function AppLayout() {
  const { scopeLabel, activeScope } = useSession();

  // Self-update (decision #6), split by platform (2026-07-23):
  //
  // WEB (unchanged): poll every 15 min, reload ONLY while the tab is hidden —
  // a hidden tab can't be mid-anything, and background browser tabs keep
  // ticking timers so the check actually runs.
  //
  // NATIVE: the hidden-only rule can never fire in a Capacitor shell — the OS
  // FREEZES WebView timers in the background (no poll runs while "hidden") and
  // a foregrounded app is never "hidden" (so a reload was never allowed). The
  // shell therefore stayed on a stale bundle indefinitely. Policy ported from
  // the kiosk's state-gated pattern (Kiosk.jsx: check immediately when safe,
  // poll while safe): reload when NOT in an active flow — here "active" means
  // any open modal (a form mid-entry would be wiped). Checks run at boot, on
  // foreground resume, and on each poll tick. With session persistence
  // (Tier 1) the reload silently restores the session — the update reads as a
  // blink, not a logout.
  //
  // The reload itself is announced first: a non-blocking "Updating…" notice
  // for ~5s, CANCELLED by any user interaction (they're active — defer and
  // retry at the next quiet moment). The deferred retry reloads directly:
  // the new-deploy decision was already made, and appUpdate's attempt cap
  // must not be consumed by cancels.
  const [updateNotice, setUpdateNotice] = useState(false);
  const updateTimersRef = useRef({ reload: null, retry: null });
  const noticeThenReloadRef = useRef(null);
  if (!noticeThenReloadRef.current) {
    const start = () => {
      const timers = updateTimersRef.current;
      if (timers.reload) return; // notice already showing
      if (document.querySelector('.modal.show')) {
        // Became unsafe since the check — retry at the next quiet moment.
        timers.retry = setTimeout(start, 60_000);
        return;
      }
      setUpdateNotice(true);
      const cancel = () => {
        clearTimeout(timers.reload);
        timers.reload = null;
        setUpdateNotice(false);
        window.removeEventListener('pointerdown', cancel, true);
        window.removeEventListener('keydown', cancel, true);
        timers.retry = setTimeout(start, 60_000);
      };
      window.addEventListener('pointerdown', cancel, true);
      window.addEventListener('keydown', cancel, true);
      timers.reload = setTimeout(() => {
        window.removeEventListener('pointerdown', cancel, true);
        window.removeEventListener('keydown', cancel, true);
        window.location.reload();
      }, 5_000);
    };
    noticeThenReloadRef.current = start;
  }

  const safeToReloadNatively = () => !document.querySelector('.modal.show');
  useScopedPolling({
    channel: 'app-update',
    intervalMs: UPDATE_CHECK_INTERVAL_MS,
    requireVisible: false,
    poll: async () => {
      if (isNative) {
        if (safeToReloadNatively()) {
          await checkForDeployedUpdate({ reload: noticeThenReloadRef.current });
        }
      } else if (document.visibilityState === 'hidden') {
        await checkForDeployedUpdate();
      }
    },
  });
  useEffect(() => {
    if (!isNative) return undefined;
    const timers = updateTimersRef.current;
    // Boot/load: a cold start served from the WebView HTTP cache can be a
    // stale bundle — catch it immediately (reload attempts are capped in
    // appUpdate.js, so a flapping version.json can't loop the shell). At boot
    // nothing is in progress, so reload directly — no notice needed.
    checkForDeployedUpdate();
    // Resume: timers were frozen while backgrounded; returning to the app is
    // the natural not-mid-interaction moment to catch up.
    const offResume = onAppStateChange(({ isActive }) => {
      if (isActive && safeToReloadNatively()) {
        checkForDeployedUpdate({ reload: noticeThenReloadRef.current });
      }
    });
    return () => {
      offResume();
      clearTimeout(timers.reload);
      clearTimeout(timers.retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <aside className="app-sidebar d-none d-lg-flex flex-column">
        <SidebarBrand />
        <NavItems />
      </aside>

      <div className="app-main d-flex flex-column min-vh-100">
        <header className="app-topbar d-flex align-items-center gap-3 px-3 px-lg-4">
          {/* Sidebar carries the brand ≥lg; on mobile a compact mark anchors
              identity where the hamburger used to sit. */}
          <span className="app-topbar-brand d-lg-none" aria-hidden="true">
            <i className="fas fa-shield-halved" />
          </span>
          {/* Resolved scope chain — click to open the scope drill-down.
              Fleet parity (scope-spec §4/§5): deepest-tier colored dot + an
              explicit caret so the chain reads as a control, not a label. */}
          <Link to="/scope" className="text-muted small text-truncate text-decoration-none d-flex align-items-center gap-2" title="Change workspace scope">
            {scopeLabel ? (
              <>
                <span
                  className="app-scope-dot"
                  aria-hidden="true"
                  style={{
                    background: activeScope?.buildingName
                      ? 'var(--sp-scope-building)'
                      : activeScope?.locationName
                        ? 'var(--sp-scope-location)'
                        : activeScope?.divisionName
                          ? 'var(--sp-scope-division)'
                          : 'var(--sp-scope-org)',
                  }}
                />
                <span className="text-truncate">
                  {[scopeLabel, activeScope?.divisionName, activeScope?.locationName, activeScope?.buildingName]
                    .filter(Boolean)
                    .join(' › ')}
                </span>
                <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }} aria-hidden="true" />
              </>
            ) : null}
          </Link>
          {/* No profile popover here — Profile is a nav destination (fleet
              normalization to the mapping app's pattern, owner 2026-07-23:
              header popovers work poorly on small screens). Theme, timezone,
              scope change, and sign-out live on pages/Profile.jsx. */}
        </header>
        <main className="flex-grow-1 p-3 p-lg-4">
          <Outlet />
        </main>
      </div>

      <BottomNav items={NAV_ITEMS} />

      {updateNotice && (
        <div
          role="status"
          className="position-fixed start-50 translate-middle-x bg-dark text-white rounded px-3 py-2 small d-flex align-items-center gap-2"
          style={{ bottom: 'calc(5rem + var(--app-inset-bottom, 0px))', zIndex: 2000, opacity: 0.95 }}
        >
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Updating SafePass…
        </div>
      )}
    </div>
  );
}
