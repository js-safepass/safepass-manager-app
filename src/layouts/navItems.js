// Primary navigation config — one source rendered two ways: the sidebar list
// (≥lg, AppLayout) and the always-open bottom tab bar (<lg, components/
// BottomNav.jsx). Lives in its own module so the component files only export
// components (react-refresh/only-export-components).
export const NAV_ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { to: '/visitors', icon: 'fa-users', label: 'Visitors' },
  { to: '/visits', icon: 'fa-clipboard-list', label: 'Visits' },
  { to: '/notifications', icon: 'fa-bell', label: 'Notifications' },
  // Fleet normalization (owner 2026-07-23): Profile is a nav destination
  // (mapping's bottom-tab pattern), not a header popover.
  { to: '/profile', icon: 'fa-circle-user', label: 'Profile' },
];
