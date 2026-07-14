import { useEffect, useState } from 'react';
import { Badge, Button, Offcanvas } from 'react-bootstrap';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/useAuth.js';
import { useSession } from '../state/useSession.js';
import { useNotifications } from '../state/useNotifications.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { checkForDeployedUpdate, UPDATE_CHECK_INTERVAL_MS } from '../lib/appUpdate.js';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { to: '/visitors', icon: 'fa-users', label: 'Visitors' },
  { to: '/visits', icon: 'fa-clipboard-list', label: 'Visits' },
  { to: '/notifications', icon: 'fa-bell', label: 'Notifications' },
];

function NavItems({ onNavigate }) {
  const { unreadCount } = useNotifications();
  return (
    <ul className="nav flex-column app-sidebar-nav">
      {NAV_ITEMS.map((item) => (
        <li className="nav-item" key={item.to}>
          <NavLink to={item.to} className="nav-link d-flex align-items-center gap-2" onClick={onNavigate}>
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

// App shell: fixed navy sidebar (≥lg) that collapses to a top bar with an
// offcanvas drawer below lg — key interactions stay pinned, content scrolls.
// Sidebar look follows sentinel-ui's design tokens (260px,
// --safepass-primary-dark navy, white-on-8%-white active state).
export default function AppLayout() {
  const { signOut } = useAuth();
  const { scopeLabel, activeScope } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

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

      <Offcanvas show={drawerOpen} onHide={() => setDrawerOpen(false)} className="app-sidebar-drawer">
        <Offcanvas.Header closeButton closeVariant="white">
          <SidebarBrand />
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <NavItems onNavigate={() => setDrawerOpen(false)} />
        </Offcanvas.Body>
      </Offcanvas>

      <div className="app-main d-flex flex-column min-vh-100">
        <header className="app-topbar d-flex align-items-center gap-3 px-3 px-lg-4">
          <Button
            variant="link"
            className="d-lg-none p-0 text-body"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <i className="fas fa-bars fs-5" aria-hidden="true" />
          </Button>
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
    </div>
  );
}
