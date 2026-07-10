import { createContext, useContext } from 'react';

// Context + hook live here (not in NetworkContext.jsx) so the provider file can
// export only its component — keeps React Fast Refresh working. Mirrors the
// useKioskSession.js / useAuth.js split.
export const NetworkContext = createContext(null);

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return ctx;
}
