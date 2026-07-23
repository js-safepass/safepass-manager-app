import { NavLink } from 'react-router-dom';
import { useNotifications } from '../state/useNotifications.js';

// Always-open bottom tab bar — the primary navigation below lg, replacing the
// old offcanvas drawer (there is nothing to open; the bar is always there and
// thumb-reachable). Hidden at ≥lg where the fixed sidebar takes over
// (d-lg-none). Route-based (NavLink), so the active tab tracks the URL exactly
// like the sidebar, and the Notifications tab carries the shared unread badge.
// Visual pattern follows the mapping app's sp-bottomnav, restyled on this
// app's navy chrome tokens; `items` is the same NAV_ITEMS the sidebar renders,
// passed down so there is one nav source.
export default function BottomNav({ items }) {
  const { unreadCount } = useNotifications();
  return (
    <nav className="app-bottomnav d-lg-none" aria-label="Primary">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className="app-bottomnav__tab">
          <span className="app-bottomnav__icon">
            <i className={`fas ${item.icon}`} aria-hidden="true" />
            {item.to === '/notifications' && unreadCount > 0 ? (
              <span className="app-bottomnav__count">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </span>
          <span className="app-bottomnav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
