import { createContext, useContext } from 'react';

// Context + hook live here (not in SessionContext.jsx) so the provider file
// can export only its component — keeps React Fast Refresh working.
export const SessionContext = createContext(null);

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
