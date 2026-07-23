import { createContext, useContext } from 'react';

// Context + hook split (Fast Refresh convention, same as useSession).
export const UserSettingsContext = createContext(null);

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error('useUserSettings must be used within UserSettingsProvider');
  }
  return context;
}
