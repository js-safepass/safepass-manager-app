import { useMemo } from 'react';
import { createManagerApi, createMockManagerApi } from '../lib/managerApi.js';
import { useAuth } from './useAuth.js';
import { ApiContext } from './useApi.js';

// Owns the single ManagerApi instance (the centralized request seam). All
// components reach the backend via useApi() — never by importing
// managerApi.js directly — so auth wiring and the deferred DPoP retrofit
// stay in one place.
//
// Real mode: tokens come from getFreshAccessToken (silent refresh inside),
// and any authoritative 401 signs the user out via the seam's
// onUnauthorized hook — screens never hand-roll re-auth.
//
// VITE_MANAGER_MOCK=true (build var) swaps in the stateful mock: the entire
// app must remain drivable with no backend (seed bundle BOOTSTRAP step 3).
export function ApiProvider({ children }) {
  const { getFreshAccessToken, signOut } = useAuth();
  const useMock = import.meta.env.VITE_MANAGER_MOCK === 'true';

  const api = useMemo(() => {
    if (useMock) return createMockManagerApi();
    return createManagerApi({
      baseUrl: import.meta.env.VITE_MANAGER_API_BASE,
      getAccessToken: getFreshAccessToken,
      // Local sign-out only: the Cognito SSO cookie may still be valid, so
      // the login screen restores the session in one click.
      onUnauthorized: () => signOut({ hosted: false }),
    });
  }, [useMock, getFreshAccessToken, signOut]);

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
