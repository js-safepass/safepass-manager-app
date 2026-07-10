// Pins the authorize/token URLs to the bridge domain + this app's client id
// (D4: never raw *.amazoncognito.com). Guards config regressions now that
// the real app client (5grgviekbiv44ab9llnsdqnp55, 2026-07-10) is wired.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.safepass.com');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', '5grgviekbiv44ab9llnsdqnp55');
  vi.stubEnv('VITE_COGNITO_REDIRECT_URI', 'http://localhost:5173/auth/callback');
  vi.stubEnv('VITE_COGNITO_LOGOUT_URI', 'http://localhost:5173/auth/logout');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('buildAuthorizeUrl targets the bridge with PKCE and this app client', async () => {
  const { buildAuthorizeUrl } = await import('./cognitoHostedUi.js');
  const url = new URL(buildAuthorizeUrl({ state: 'st_1', codeChallenge: 'ch_1' }));
  expect(url.origin).toBe('https://auth.safepass.com');
  expect(url.pathname).toBe('/oauth2/authorize');
  expect(url.searchParams.get('client_id')).toBe('5grgviekbiv44ab9llnsdqnp55');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/auth/callback');
});

test('buildLogoutUrl targets the bridge logout endpoint', async () => {
  const { buildLogoutUrl } = await import('./cognitoHostedUi.js');
  const url = new URL(buildLogoutUrl());
  expect(url.origin).toBe('https://auth.safepass.com');
  expect(url.pathname).toBe('/logout');
  expect(url.searchParams.get('client_id')).toBe('5grgviekbiv44ab9llnsdqnp55');
});
