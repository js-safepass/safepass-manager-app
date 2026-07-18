// Logout must leave NO local session residue, and the hosted /logout
// redirect (the only thing that kills the Cognito SSO cookie) must carry the
// registered client_id + logout_uri. AuthContext wiring is covered in
// state/AuthContext.test.jsx; this file pins the pure halves.
//
// Storages are injected fakes: the vitest jsdom environment exposes a
// method-less localStorage, so the real Storage API is simulated here.

import { afterEach, expect, test, vi } from 'vitest';
import { purgeBrowserSession, redirectToHostedLogout } from './sessionCleanup.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test('purgeBrowserSession clears sessionStorage (PKCE + return path) wholesale', () => {
  const session = fakeStorage({
    manager_pkce_verifier: 'v1',
    manager_pkce_state: 'st1',
    manager_return_to: '/visitors',
  });

  purgeBrowserSession({ session, local: fakeStorage() });

  expect(session.length).toBe(0);
});

test('purgeBrowserSession removes safepass.* localStorage keys and nothing else', () => {
  const local = fakeStorage({
    'safepass.activeOrgId': 'org_1',
    'safepass.scope.org_1': '{"locationId":"loc_1"}',
    unrelated_key: 'keep-me',
  });

  purgeBrowserSession({ session: fakeStorage(), local });

  expect(local.getItem('safepass.activeOrgId')).toBeNull();
  expect(local.getItem('safepass.scope.org_1')).toBeNull();
  expect(local.getItem('unrelated_key')).toBe('keep-me');
});

test('purgeBrowserSession survives an unavailable storage (private mode)', () => {
  const broken = {
    get length() { throw new Error('denied'); },
    clear() { throw new Error('denied'); },
  };
  expect(() => purgeBrowserSession({ session: broken, local: broken })).not.toThrow();
});

test('redirectToHostedLogout navigates to the Cognito /logout endpoint with client_id + logout_uri', () => {
  vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.safepass.com');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', '5grgviekbiv44ab9llnsdqnp55');
  vi.stubEnv('VITE_COGNITO_LOGOUT_URI', 'http://localhost:5273/auth/logout');

  const navigate = vi.fn();
  const navigated = redirectToHostedLogout({ navigate });

  expect(navigated).toBe(true);
  expect(navigate).toHaveBeenCalledTimes(1);
  const url = new URL(navigate.mock.calls[0][0]);
  expect(url.origin).toBe('https://auth.safepass.com');
  expect(url.pathname).toBe('/logout');
  expect(url.searchParams.get('client_id')).toBe('5grgviekbiv44ab9llnsdqnp55');
  expect(url.searchParams.get('logout_uri')).toBe('http://localhost:5273/auth/logout');
});

test('redirectToHostedLogout degrades to a no-op (returns false) when config is missing', () => {
  vi.stubEnv('VITE_COGNITO_DOMAIN', '');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', '');

  const navigate = vi.fn();
  expect(redirectToHostedLogout({ navigate })).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});
