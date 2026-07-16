// Integration coverage for the two whoami shapes (auth-contract §3) flowing
// through SessionProvider -> SessionGate. Pure classification is unit-tested in
// lib/whoami.test.js; this proves the wiring renders the right screen.

import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiContext } from './useApi.js';
import { SessionProvider } from './SessionContext.jsx';
import { AuthProvider } from './AuthContext.jsx';
import SessionGate from '../components/SessionGate.jsx';

function renderWithApi(api) {
  return render(
    <AuthProvider>
      <ApiContext.Provider value={api}>
        <SessionProvider>
          <SessionGate>
            <div>PROTECTED APP CONTENT</div>
          </SessionGate>
        </SessionProvider>
      </ApiContext.Provider>
    </AuthProvider>,
  );
}

test('trimmed, MFA-gated whoami renders the MFA-completion screen, not the app or no-access', async () => {
  const api = {
    // No org_ids / assignments / effective_permissions — the trimmed shape.
    whoami: async () => ({
      data: {
        user_id: 'u1',
        email: 'staff@example.com',
        principal: 'user',
        mfa_required: true,
        mfa_satisfied: false,
        evaluated_at: '2026-07-16T00:00:00Z',
      },
    }),
    // Must never be reached in the gated path (no authz surface to fetch).
    listAuthScopes: async () => { throw new Error('should not fetch scopes when MFA-gated'); },
  };
  renderWithApi(api);

  expect(await screen.findByText(/multi-factor authentication required/i)).toBeInTheDocument();
  expect(screen.queryByText(/PROTECTED APP CONTENT/)).not.toBeInTheDocument();
  // A trimmed payload (no org_ids) must NOT be misread as "no workspace access".
  expect(screen.queryByText(/no workspace access/i)).not.toBeInTheDocument();
});

test('full whoami with orgs renders the protected app', async () => {
  const api = {
    whoami: async () => ({
      data: {
        user_id: 'u1',
        email: 'staff@example.com',
        principal: 'user',
        org_ids: ['org_1'],
        assignments: [{ role: 'front_desk', org_id: 'org_1' }],
        effective_permissions: {},
        mfa_required: true,
        mfa_satisfied: true,
        evaluated_at: '2026-07-16T00:00:00Z',
      },
    }),
    listAuthScopes: async () => ({ data: {} }),
  };
  renderWithApi(api);

  expect(await screen.findByText(/PROTECTED APP CONTENT/)).toBeInTheDocument();
});
