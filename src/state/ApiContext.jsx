import { useMemo } from 'react';
import { createManagerApi, createMockManagerApi } from '../lib/managerApi.js';
import { useAuth } from './useAuth.js';
import { ApiContext } from './useApi.js';

// Owns the single ManagerApi instance (the centralized request seam). All
// components reach the backend via useApi() — never by importing
// managerApi.js directly — so auth wiring and the deferred DPoP retrofit
// stay in one place.
//
// Real mode: tokens come from getFreshAccessToken (silent refresh inside);
// the seam retries a 401 once with a forced refresh, then hands off to
// AuthContext.onUnauthorized — threshold-gated there, so screens never
// hand-roll re-auth and a lone transient 401 never ends the session.
//
// VITE_MANAGER_MOCK=true (build var) swaps in the stateful mock: the entire
// app must remain drivable with no backend (seed bundle BOOTSTRAP step 3).
export function ApiProvider({ children }) {
  const { getFreshIdToken, onUnauthorized } = useAuth();
  const useMock = import.meta.env.VITE_MANAGER_MOCK === 'true';

  const api = useMemo(() => {
    if (useMock) return createMockManagerApi();
    return createManagerApi({
      baseUrl: import.meta.env.VITE_MANAGER_API_BASE,
      // The bearer is the Cognito ID token (auth-contract §1); the accessor
      // silently refreshes it and rotates the id_token on refresh.
      getBearerToken: getFreshIdToken,
      onUnauthorized,
    });
  }, [useMock, getFreshIdToken, onUnauthorized]);

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
