import { useMemo } from 'react';
import { createManagerApi, createMockManagerApi } from '../lib/managerApi.js';
import { useAuth } from './useAuth.js';
import { ApiContext } from './useApi.js';

// Owns the single ManagerApi instance (the centralized request seam). All
// components reach the backend via useApi() — never by importing
// managerApi.js directly — so auth wiring and the deferred DPoP retrofit
// stay in one place.
//
// VITE_MANAGER_MOCK=true swaps in the mock: the entire app must remain
// drivable with no backend (seed bundle BOOTSTRAP step 3).
export function ApiProvider({ children }) {
  const { accessToken } = useAuth();
  const useMock = import.meta.env.VITE_MANAGER_MOCK === 'true';

  const api = useMemo(() => {
    if (useMock) return createMockManagerApi();
    return createManagerApi({
      baseUrl: import.meta.env.VITE_MANAGER_API_BASE,
      getAccessToken: () => accessToken,
    });
  }, [useMock, accessToken]);

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
