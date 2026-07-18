// The /auth/logout landing (the registered logout_uri Cognito redirects to
// after the hosted /logout kills the SSO cookie) must be a pass-through:
// purge local session residue and render the sign-in screen IMMEDIATELY —
// never an interstitial page with a countdown or button.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '../state/AuthContext.jsx';
import Login from './Login.jsx';
import { purgeBrowserSession } from '../lib/sessionCleanup.js';

vi.mock('../lib/sessionCleanup.js', () => ({
  purgeBrowserSession: vi.fn(),
  redirectToHostedLogout: vi.fn(() => true),
}));

beforeEach(() => {
  // Force real-auth posture regardless of the local .env (VITE_MODE=dev).
  vi.stubEnv('VITE_MODE', '');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/');
});

test('landing on /auth/logout purges the session and shows the sign-in screen immediately', async () => {
  window.history.replaceState({}, '', '/auth/logout');

  render(
    <AuthProvider>
      <Login />
    </AuthProvider>,
  );

  // The sign-in CTA is present right away — no countdown, no extra click.
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(purgeBrowserSession).toHaveBeenCalledTimes(1);
  // The landing path is consumed so a reload can't replay the logout route.
  expect(window.location.pathname).toBe('/');
});

test('a normal visit renders the sign-in screen without purging anything', () => {
  render(
    <AuthProvider>
      <Login />
    </AuthProvider>,
  );

  expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(purgeBrowserSession).not.toHaveBeenCalled();
});
