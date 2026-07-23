import { createContext, useContext } from 'react';

// Context + hook live here (not in ApiContext.jsx) so the provider file can
// export only its component — keeps React Fast Refresh working. Mirrors the
// useAuth.js / useNetwork.js split.
export const ApiContext = createContext(null);

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
}
