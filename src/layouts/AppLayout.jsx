import { useEffect } from 'react';
import { Badge, Dropdown } from 'react-bootstrap';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/useAuth.js';
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
  const { signOut } = useAuth();
  const { scopeLabel, activeScope, whoami } = useSession();

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
  // foreground resume, and on each poll tick. An auto-reload lands on Login
  // (tokens are in-memory by design); the SSO cookie gives one-click re-entry.
  const safeToReloadNatively = () => !document.querySelector('.modal.show');
  useScopedPolling({
    channel: 'app-update',
    intervalMs: UPDATE_CHECK_INTERVAL_MS,
    requireVisible: false,
    poll: async () => {
      if (isNative) {
        if (safeToReloadNatively()) await checkForDeployedUpdate();
      } else if (document.visibilityState === 'hidden') {
        await checkForDeployedUpdate();
      }
    },
  });
  useEffect(() => {
    if (!isNative) return undefined;
    // Boot/load: a cold start served from the WebView HTTP cache can be a
    // stale bundle — catch it immediately (reload attempts are capped in
    // appUpdate.js, so a flapping version.json can't loop the shell).
    checkForDeployedUpdate();
    // Resume: timers were frozen while backgrounded; returning to the app is
    // the natural not-mid-interaction moment to catch up.
    return onAppStateChange(({ isActive }) => {
      if (isActive && safeToReloadNatively()) checkForDeployedUpdate();
    });
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
          {/* Resolved scope chain — click to open the scope drill-down. */}
          <Link to="/scope" className="text-muted small text-truncate text-decoration-none" title="Change workspace scope">
            {scopeLabel ? (
              <>
                <i className="fas fa-building me-2" aria-hidden="true" />
                {[scopeLabel, activeScope?.divisionName, activeScope?.locationName, activeScope?.buildingName]
                  .filter(Boolean)
                  .join(' › ')}
              </>
            ) : null}
          </Link>
          {/* Profile menu (owner feedback 2026-07-23): the sign-out action
              moves behind a profile icon so the topbar stays clean and the
              menu has room to grow (preferences, account) later. */}
          <div className="ms-auto">
            <Dropdown align="end">
              <Dropdown.Toggle
                variant="link"
                id="profile-menu"
                className="p-0 text-body app-profile-toggle"
                aria-label="Account menu"
              >
                <i className="fas fa-circle-user fs-4" aria-hidden="true" />
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {whoami?.email && (
                  <>
                    <Dropdown.Header className="text-truncate">{whoami.email}</Dropdown.Header>
                    <Dropdown.Divider />
                  </>
                )}
                <Dropdown.Item as={Link} to="/scope">
                  <i className="fas fa-building me-2" aria-hidden="true" />
                  Change scope
                </Dropdown.Item>
                <Dropdown.Item onClick={() => signOut()}>
                  <i className="fas fa-arrow-right-from-bracket me-2" aria-hidden="true" />
                  Sign out
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </header>
        <main className="flex-grow-1 p-3 p-lg-4">
          <Outlet />
        </main>
      </div>

      <BottomNav items={NAV_ITEMS} />
    </div>
  );
}
