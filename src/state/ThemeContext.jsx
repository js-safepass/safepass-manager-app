import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './useTheme.js';

// Theme (WS-4, ported from the mapping app per D12; owner-locked semantics:
// SERVER default, LOCAL override, explicit Auto/Light/Dark three-way).
//
// Bootstrap 5.3 color modes key off `data-bs-theme` on <html> and do NOT
// auto-follow the OS — so 'auto' is resolved here via matchMedia and
// re-resolved when the OS preference changes.
//
// Resolution: local override (sp-theme, set the moment the user picks in the
// menu) → server default (pushed in by UserSettingsContext once settings
// load) → 'auto'. localStorage holds a UI preference only, never a
// credential (D6 is about tokens).
const STORAGE_KEY = 'sp-theme';
const MODES = ['auto', 'light', 'dark'];

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }) {
  const [localMode, setLocalMode] = useState(readStored); // null = no override
  const [serverDefault, setServerDefault] = useState(null);

  const mode = localMode || serverDefault || 'auto';

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
      root.setAttribute('data-bs-theme', resolved);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  // The menu's explicit pick: becomes the local override AND (via the menu's
  // settings write) the new server default — this device is snappy, other
  // devices roam.
  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return;
    setLocalMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* private mode etc. — preference just won't persist */ }
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, setServerDefault }),
    [mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
