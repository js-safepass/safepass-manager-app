import { AUTH_ACTION } from '../lib/authActions.js';
import { useAuth } from '../state/useAuth.js';
import { useSession } from '../state/useSession.js';
import MfaRequiredNotice from './MfaRequiredNotice.jsx';

// Mid-session MFA gate. When a protected call comes back MFA_REQUIRED /
// MFA_TOTP_REQUIRED after the app is already running, AuthContext sets
// `authAction` (the session stays valid — the user just has to remediate in the
// admin app). This overlays the whole app until they do. Terminal / re-auth
// codes flip the auth status to signed-out instead, so they land on Login and
// never reach this overlay.
export default function AuthActionOverlay() {
  const { authAction, clearAuthAction, signOut } = useAuth();
  const { refreshSession } = useSession();

  if (!authAction) return null;

  const variant = authAction.action === AUTH_ACTION.MFA_TOTP ? 'totp' : 'enroll';

  // Re-check whoami: if MFA is now satisfied the session goes 'ready' and the
  // app renders normally; if still gated, SessionGate takes over. Either way
  // the overlay clears.
  const handleRefresh = () => {
    clearAuthAction();
    refreshSession();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'var(--bs-body-bg, #1c2033)',
        overflow: 'auto',
      }}
    >
      <MfaRequiredNotice variant={variant} onRefresh={handleRefresh} onSignOut={() => signOut()} />
    </div>
  );
}
