// Shell smoke test: mounts the ENTIRE signed-in app (dev-mode auth bypass +
// mock API) and asserts the dashboard renders with live data. Component
// coverage stays thin by design (D11) — this one test exists to catch
// provider/router/mock wiring breakage, not UI detail.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

beforeEach(() => {
  vi.stubEnv('VITE_MODE', 'dev');
  vi.stubEnv('VITE_MANAGER_MOCK', 'true');
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('signed-in app mounts: dashboard, metric tiles, and nav render from the mock', async () => {
  const { default: App } = await import('./App.jsx');
  const { AuthProvider } = await import('./state/AuthContext.jsx');
  const { FlashProvider } = await import('./lib/flashProvider.jsx');

  render(
    <AuthProvider>
      <FlashProvider>
        <App />
      </FlashProvider>
    </AuthProvider>,
  );

  expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  expect(await screen.findByText(/on site now/i)).toBeInTheDocument();
  // Sidebar nav renders all four sections.
  expect(screen.getAllByRole('link', { name: /visitors/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /notifications/i }).length).toBeGreaterThan(0);
  // Live mock data reached the notification feed.
  expect(await screen.findByText(/jane doe checked in/i)).toBeInTheDocument();
});
