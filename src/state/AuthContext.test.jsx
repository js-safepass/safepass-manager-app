// Wiring coverage for the two sign-out flavors (the pure rules live in
// lib/authFailurePolicy.js + lib/sessionCleanup.js, tested there):
//
//   - EXPLICIT sign-out (the navbar button) must be a REAL logout: purge the
//     browser session, then redirect through the Cognito hosted /logout
//     endpoint — the only thing that kills the managed-login SSO cookie. A
//     logout that skips the redirect leaves the next sign-in able to
//     re-authenticate silently WITHOUT credentials (web-UI QA bug class).
//   - API-driven sign-out (hosted=false, the 401/terminal paths) stays
//     local-only by design: it forces a RE-login (401 → re-auth → resume),
//     where SSO one-click re-entry is the point.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { AuthProvider } from './AuthContext.jsx';
import { useAuth } from './useAuth.js';
import { purgeBrowserSession, redirectToHostedLogout } from '../lib/sessionCleanup.js';

vi.mock('../lib/sessionCleanup.js', () => ({
  purgeBrowserSession: vi.fn(),
  redirectToHostedLogout: vi.fn(() => true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Force real-auth posture: the local .env ships VITE_MODE=dev (auth
  // bypass), which would skip the sign-out side effects under test.
  vi.stubEnv('VITE_MODE', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderAuth() {
  const auth = {};
  function Grab() {
    Object.assign(auth, useAuth());
    return null;
  }
  render(
    <AuthProvider>
      <Grab />
    </AuthProvider>,
  );
  return auth;
}

test('explicit sign-out purges the browser session AND redirects to the hosted /logout (kills the SSO cookie)', async () => {
  const auth = renderAuth();
  await act(async () => {
    await auth.signIn({ token: 'tok_id_1', refreshToken: 'rt_1' });
  });
  expect(auth.status).toBe('signed_in');

  act(() => {
    auth.signOut();
  });

  expect(auth.status).toBe('signed_out');
  expect(purgeBrowserSession).toHaveBeenCalledTimes(1);
  expect(redirectToHostedLogout).toHaveBeenCalledTimes(1);
});

test('API-driven sign-out (hosted=false) stays local — no purge, no hosted redirect', async () => {
  const auth = renderAuth();
  await act(async () => {
    await auth.signIn({ token: 'tok_id_1', refreshToken: 'rt_1' });
  });

  act(() => {
    auth.signOut({ hosted: false });
  });

  expect(auth.status).toBe('signed_out');
  expect(purgeBrowserSession).not.toHaveBeenCalled();
  expect(redirectToHostedLogout).not.toHaveBeenCalled();
});

test('explicit sign-out with no live token still purges but skips the redirect', () => {
  const auth = renderAuth();
  expect(auth.status).toBe('signed_out');

  act(() => {
    auth.signOut();
  });

  expect(purgeBrowserSession).toHaveBeenCalledTimes(1);
  expect(redirectToHostedLogout).not.toHaveBeenCalled();
});
