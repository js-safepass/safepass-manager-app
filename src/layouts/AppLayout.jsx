import { Badge, Button } from 'react-bootstrap';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/useAuth.js';
import { useSession } from '../state/useSession.js';
import { useNotifications } from '../state/useNotifications.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { checkForDeployedUpdate, UPDATE_CHECK_INTERVAL_MS } from '../lib/appUpdate.js';
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
  const { scopeLabel, activeScope } = useSession();

  // Self-update (decision #6): staff leave this app open all day, and D1
  // deploys never restart a running tab. Poll /version.json every 15 min and
  // reload ONLY while the tab is hidden — the strictest reading of "never
  // reload mid-interaction": a hidden tab can't be mid-anything. A visible
  // stale tab picks the deploy up the next time the user tabs away.
  useScopedPolling({
    channel: 'app-update',
    intervalMs: UPDATE_CHECK_INTERVAL_MS,
    requireVisible: false,
    poll: async () => {
      if (document.visibilityState === 'hidden') {
        await checkForDeployedUpdate();
      }
    },
  });

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
          <div className="ms-auto">
            <Button variant="outline-secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
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
