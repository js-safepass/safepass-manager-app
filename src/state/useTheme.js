import { createContext, useContext } from 'react';

// Context + hook live here (not in ThemeContext.jsx) so the provider file can
// export only its component — keeps React Fast Refresh working (same split as
// useNotifications/useSession).
export const ThemeContext = createContext(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
