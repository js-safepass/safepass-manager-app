import { createContext, useContext } from 'react';

// Context + hook live here (not in AuthContext.jsx) so the provider file can
// export only its component — keeps React Fast Refresh working. Mirrors the
// useNetwork.js split.
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
