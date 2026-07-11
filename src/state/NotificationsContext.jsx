import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from './useApi.js';
import { useSession } from './useSession.js';
import { useScopedPolling } from '../lib/useScopedPolling.js';
import { NotificationsContext } from './useNotifications.js';

// Notification feed state shared by the inbox page and the shell's unread
// badge. Polling for now (15s foreground via useScopedPolling — pauses when
// the tab is hidden, halts on 401/403). The SSE stream-ticket layer from
// sentinel-ui's notificationsProvider lands in Phase 3 behind this same
// context, so consumers won't change.
//
// Read-state writes are optimistic with revert-on-failure — matches the
// sentinel-ui convention.
export function NotificationsProvider({ children }) {
  const api = useApi();
  const { activeOrgId } = useSession();
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    const page = await api.listNotifications({ org_id: activeOrgId, limit: 50 });
    setNotifications(page?.data || []);
  }, [api, activeOrgId]);

  // Initial load now; useScopedPolling's first tick is one interval out.
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useScopedPolling({ channel: 'notifications', poll: load, intervalMs: 15_000 });

  const markRead = useCallback(async (id) => {
    const prev = notifications;
    setNotifications((items) =>
      items.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)),
    );
    try {
      await api.markNotificationRead(id);
    } catch (err) {
      setNotifications(prev);
      throw err;
    }
  }, [api, notifications]);

  const markAllRead = useCallback(async () => {
    const prev = notifications;
    const ids = prev.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    setNotifications((items) => items.map((n) => ({ ...n, read_at: n.read_at || at })));
    try {
      await api.markNotificationsRead({ ids });
    } catch (err) {
      setNotifications(prev);
      throw err;
    }
  }, [api, notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, markRead, markAllRead, refresh: load }),
    [notifications, unreadCount, markRead, markAllRead, load],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
