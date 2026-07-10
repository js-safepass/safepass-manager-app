import { useEffect, useState } from 'react';
import { useApi } from '../state/useApi.js';
import { useAuth } from '../state/useAuth.js';
import { getUserFacingError } from '../lib/userErrors.js';

// Phase-0 landing screen: proves the auth → API → render loop end-to-end
// against mock or staging. Replaced by the real workspace (scope selector +
// notifications + dashboard) in Phase 1.
export default function Home() {
  const api = useApi();
  const { signOut } = useAuth();
  const [whoami, setWhoami] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [who, ntf] = await Promise.all([api.whoami(), api.listNotifications()]);
        if (cancelled) return;
        setWhoami(who?.data || null);
        setNotifications(ntf?.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(getUserFacingError(err, 'load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="page">
      <h1>SafePass Manager</h1>
      {loading && <p>Loading workspace…</p>}
      {error && <p style={{ color: 'var(--sp-text-error)' }}>{error}</p>}
      {!loading && !error && whoami && (
        <div className="card">
          <h2>{whoami.scope_label || 'Workspace'}</h2>
          <p>
            Signed in as {whoami.email || whoami.user_id} · {unread} unread notification
            {unread === 1 ? '' : 's'}
          </p>
        </div>
      )}
      <button className="cta" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
