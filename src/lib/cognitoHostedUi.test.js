// Pins the authorize/token URLs to the bridge domain + this app's client id
// (D4: never raw *.amazoncognito.com). Guards config regressions now that
// the real app client (5grgviekbiv44ab9llnsdqnp55, 2026-07-10) is wired.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.safepass.com');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', '5grgviekbiv44ab9llnsdqnp55');
  vi.stubEnv('VITE_COGNITO_REDIRECT_URI', 'http://localhost:5273/auth/callback');
  vi.stubEnv('VITE_COGNITO_LOGOUT_URI', 'http://localhost:5273/auth/logout');
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
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5273/auth/callback');
});

test('buildLogoutUrl targets the bridge logout endpoint', async () => {
  const { buildLogoutUrl } = await import('./cognitoHostedUi.js');
  const url = new URL(buildLogoutUrl());
  expect(url.origin).toBe('https://auth.safepass.com');
  expect(url.pathname).toBe('/logout');
  expect(url.searchParams.get('client_id')).toBe('5grgviekbiv44ab9llnsdqnp55');
});

test('refreshTokens posts the refresh grant to the bridge token endpoint', async () => {
  const { refreshTokens } = await import('./cognitoHostedUi.js');
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: init.body.toString() };
    return new Response(JSON.stringify({ access_token: 'new_at' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const payload = await refreshTokens({ refreshToken: 'rt_1' });
    expect(payload.access_token).toBe('new_at');
    expect(captured.url).toBe('https://auth.safepass.com/oauth2/token');
    const params = new URLSearchParams(captured.body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('client_id')).toBe('5grgviekbiv44ab9llnsdqnp55');
    expect(params.get('refresh_token')).toBe('rt_1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pickBearerToken selects the ID token, never the access token', async () => {
  const { pickBearerToken } = await import('./cognitoHostedUi.js');
  // Both present: the ID token is the bearer (auth-contract §1).
  expect(pickBearerToken({ id_token: 'id_1', access_token: 'acc_1' })).toBe('id_1');
  // Strict: an access-token-only response yields no bearer (never falls back
  // to the access token — that is the bug this closes).
  expect(pickBearerToken({ access_token: 'acc_1' })).toBeNull();
  expect(pickBearerToken({})).toBeNull();
  expect(pickBearerToken(null)).toBeNull();
});

test('a non-JSON gateway error surfaces the HTTP status, not a SyntaxError', async () => {
  const { refreshTokens } = await import('./cognitoHostedUi.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });
  try {
    await expect(refreshTokens({ refreshToken: 'rt_1' })).rejects.toThrow(/HTTP 502/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
