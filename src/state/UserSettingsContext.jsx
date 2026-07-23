import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './useApi.js';
import { useTheme } from './useTheme.js';
import { flattenErrorForLog } from '../lib/errorLog.js';
import { UserSettingsContext } from './useUserSettings.js';

// Per-user settings (WS-4): GET/PUT /v1/users/me/settings — VERIFIED
// allowlisted for this app client (backend apppolicy.go `appAll`,
// 2026-07-23). Owner-locked semantics: SERVER is the default, LOCAL is the
// override — on load, the server theme is pushed into ThemeContext as the
// default (a local pick still wins); menu writes go to BOTH.
//
// Writes are versioned: the schema carries `version` and PUT follows the
// fleet If-Match convention; a 409 refetches so the next write starts clean.
// Failures are non-fatal by design — settings roaming is best-effort and the
// local experience never blocks on it.
export function UserSettingsProvider({ children }) {
  const api = useApi();
  const { setServerDefault } = useTheme();
  const [settings, setSettings] = useState(null);
  const versionRef = useRef(null);

  const applyLoaded = useCallback((data) => {
    if (!data) return;
    setSettings(data);
    versionRef.current = data.version ?? null;
    if (data.theme) setServerDefault(data.theme);
  }, [setServerDefault]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getUserSettings();
        if (!cancelled) applyLoaded(res?.data || null);
      } catch (err) {
        // Best-effort: no settings -> local/defaults carry the session.
        console.warn('[settings] load failed', flattenErrorForLog(err));
      }
    })();
    return () => { cancelled = true; };
  }, [api, applyLoaded]);

  // Patch-style update: merge into the last-known server shape, PUT with
  // If-Match, keep the fresh version. 409 = another device wrote — refetch
  // and reapply the patch once.
  const updateSettings = useCallback(async (patch) => {
    const attempt = async () => {
      const body = { ...(settings || {}), ...patch };
      delete body.version; delete body.created_at; delete body.updated_at;
      const res = await api.updateUserSettings(body, { ifMatch: versionRef.current });
      applyLoaded(res?.data || null);
    };
    try {
      await attempt();
    } catch (err) {
      if (err?.status === 409) {
        try {
          const res = await api.getUserSettings();
          applyLoaded(res?.data || null);
          await attempt();
          return;
        } catch (retryErr) {
          console.warn('[settings] update retry failed', flattenErrorForLog(retryErr));
          return;
        }
      }
      console.warn('[settings] update failed', flattenErrorForLog(err));
    }
  }, [api, settings, applyLoaded]);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}
