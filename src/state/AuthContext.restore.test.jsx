// Boot-restore wiring (Tier 1, docs/session-persistence-plan.md): on NATIVE,
// a stored refresh token silently becomes a live session via the refresh
// grant; failures follow the wipe table (definitive → wipe, transient → keep).
// Separate file from AuthContext.test.jsx because the whole suite here runs
// under a mocked NATIVE platform + mocked secure storage.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext.jsx';
import { useAuth } from './useAuth.js';
import { secureStorageGet, secureStorageRemove, secureStorageSet } from '../lib/native/secureStorage.js';
import { refreshTokens } from '../lib/cognitoHostedUi.js';
import { SESSION_STORAGE_KEY, packStoredSession } from '../lib/sessionPersistence.js';

vi.mock('../lib/platform.js', () => ({
  isNative: true, isIOS: true, isAndroid: false, isWeb: false, platform: 'ios',
}));
vi.mock('../lib/native/secureStorage.js', () => ({
  secureStorageGet: vi.fn(async () => null),
  secureStorageSet: vi.fn(async () => {}),
  secureStorageRemove: vi.fn(async () => {}),
}));
vi.mock('../lib/sessionCleanup.js', () => ({
  purgeBrowserSession: vi.fn(),
  redirectToHostedLogout: vi.fn(() => true),
}));
vi.mock('../lib/cognitoHostedUi.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, refreshTokens: vi.fn() };
});

// ^ NOTE: real isDefinitiveRefreshFailure/pickBearerToken are kept — the tests
// drive them through realistic grant responses/errors.

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_MODE', ''); // real-auth posture (local .env ships dev bypass)
});
afterEach(() => vi.unstubAllEnvs());

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

const stored = packStoredSession('rt_stored', 1700000000000);

test('boot with a stored session: silent restore -> signed_in, no Login', async () => {
  secureStorageGet.mockResolvedValue(stored);
  refreshTokens.mockResolvedValue({ id_token: 'idtok.new', access_token: 'at' });

  const auth = renderAuth();
  expect(auth.status).toBe('restoring'); // splash state, never Login

  await waitFor(() => expect(auth.status).toBe('signed_in'));
  expect(refreshTokens).toHaveBeenCalledWith({ refreshToken: 'rt_stored' });
  // No rotation in the response -> the stored copy is already correct.
  expect(secureStorageSet).not.toHaveBeenCalled();
});

test('rotation on restore re-persists the NEW refresh token', async () => {
  secureStorageGet.mockResolvedValue(stored);
  refreshTokens.mockResolvedValue({ id_token: 'idtok.new', refresh_token: 'rt_rotated' });

  const auth = renderAuth();
  await waitFor(() => expect(auth.status).toBe('signed_in'));
  expect(secureStorageSet).toHaveBeenCalledWith(
    SESSION_STORAGE_KEY,
    expect.stringContaining('rt_rotated'),
  );
});

test('nothing stored -> signed_out (normal Login), nothing wiped', async () => {
  secureStorageGet.mockResolvedValue(null);
  const auth = renderAuth();
  await waitFor(() => expect(auth.status).toBe('signed_out'));
  expect(refreshTokens).not.toHaveBeenCalled();
  expect(secureStorageRemove).not.toHaveBeenCalled();
});

test('DEFINITIVE grant failure (invalid_grant) wipes the stored session', async () => {
  secureStorageGet.mockResolvedValue(stored);
  const dead = new Error('invalid_grant');
  dead.oauthError = 'invalid_grant';
  refreshTokens.mockRejectedValue(dead);

  const auth = renderAuth();
  await waitFor(() => expect(auth.status).toBe('signed_out'));
  expect(secureStorageRemove).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
});

test('TRANSIENT failure (offline boot) keeps the stored session for next boot', async () => {
  secureStorageGet.mockResolvedValue(stored);
  refreshTokens.mockRejectedValue(new TypeError('network down'));

  const auth = renderAuth();
  await waitFor(() => expect(auth.status).toBe('signed_out'));
  expect(secureStorageRemove).not.toHaveBeenCalled();
});

test('sign-in persists the refresh token; sign-out wipes it', async () => {
  secureStorageGet.mockResolvedValue(null);
  const auth = renderAuth();
  await waitFor(() => expect(auth.status).toBe('signed_out'));

  await act(async () => {
    await auth.signIn({ token: 'idtok.login', refreshToken: 'rt_login' });
  });
  expect(secureStorageSet).toHaveBeenCalledWith(
    SESSION_STORAGE_KEY,
    expect.stringContaining('rt_login'),
  );

  act(() => auth.signOut({ hosted: false }));
  expect(secureStorageRemove).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
});
