import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsContext } from '../state/useNotifications.js';
import BottomNav from './BottomNav.jsx';

const ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { to: '/visitors', icon: 'fa-users', label: 'Visitors' },
  { to: '/visits', icon: 'fa-clipboard-list', label: 'Visits' },
  { to: '/notifications', icon: 'fa-bell', label: 'Notifications' },
];

function renderNav({ unreadCount = 0, path = '/dashboard' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotificationsContext.Provider value={{ unreadCount }}>
        <BottomNav items={ITEMS} />
      </NotificationsContext.Provider>
    </MemoryRouter>,
  );
}

test('renders a tab per nav item', () => {
  renderNav();
  for (const item of ITEMS) {
    expect(screen.getByRole('link', { name: new RegExp(item.label, 'i') })).toBeInTheDocument();
  }
});

test('marks the active route with aria-current, tracking the URL like the sidebar', () => {
  renderNav({ path: '/visits' });
  expect(screen.getByRole('link', { name: /visits/i })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current');
});

test('shows the unread badge only on Notifications and caps it at 99+', () => {
  renderNav({ unreadCount: 150 });
  expect(screen.getByRole('link', { name: /notifications/i })).toHaveTextContent('99+');
  // No other tab carries a count.
  expect(screen.getByRole('link', { name: /visitors/i })).toHaveTextContent(/^Visitors$/);
});

test('hides the unread badge when nothing is unread', () => {
  renderNav({ unreadCount: 0 });
  expect(screen.getByRole('link', { name: /notifications/i })).toHaveTextContent(/^Notifications$/);
});
