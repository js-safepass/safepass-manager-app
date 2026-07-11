import { createContext, useContext } from 'react';

// Context + hook live here (not in NotificationsContext.jsx) so the provider
// file can export only its component — keeps React Fast Refresh working.
export const NotificationsContext = createContext(null);

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
