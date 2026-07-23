// Integration coverage for whoami flowing through SessionProvider ->
// SessionGate. Pure classification is unit-tested in lib/whoami.test.js; this
// proves the wiring renders the right screen. MFA is enforced by Cognito at the
// pool level, so a valid token always yields the full authz surface — there is
// no trimmed/MFA-gated shape to handle here.

import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiContext } from './useApi.js';
import { SessionProvider } from './SessionContext.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { FlashProvider } from '../lib/flashProvider.jsx';
import SessionGate from '../components/SessionGate.jsx';

function renderWithApi(api) {
  return render(
    <AuthProvider>
      <FlashProvider>
        <ApiContext.Provider value={api}>
          <SessionProvider>
            <SessionGate>
              <div>PROTECTED APP CONTENT</div>
            </SessionGate>
          </SessionProvider>
        </ApiContext.Provider>
      </FlashProvider>
    </AuthProvider>,
  );
}

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
        evaluated_at: '2026-07-16T00:00:00Z',
      },
    }),
    listAuthScopes: async () => ({ data: {} }),
  };
  renderWithApi(api);

  expect(await screen.findByText(/PROTECTED APP CONTENT/)).toBeInTheDocument();
});

test('authenticated but no granted orgs renders the no-access screen, not the app', async () => {
  const api = {
    whoami: async () => ({
      data: {
        user_id: 'u1',
        email: 'staff@example.com',
        principal: 'user',
        org_ids: [],
        evaluated_at: '2026-07-16T00:00:00Z',
      },
    }),
    listAuthScopes: async () => ({ data: {} }),
  };
  renderWithApi(api);

  expect(await screen.findByText(/no workspace access/i)).toBeInTheDocument();
  expect(screen.queryByText(/PROTECTED APP CONTENT/)).not.toBeInTheDocument();
});
