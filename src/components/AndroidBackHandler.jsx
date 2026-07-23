import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { minimizeApp, onBackButton } from '../lib/native/app-lifecycle.js';

// Android hardware/gesture back (owner policy 2026-07-23, ship blocker).
//
// Registering ANY Capacitor backButton listener replaces the default —
// which was WebView history-back. That default is what broke us: with
// in-place OAuth the WebView history contains auth.safepass.com pages and
// the used /auth/callback, so back-stepping from the dashboard landed users
// in an invalid sign-in state.
//
// Policy (never touches history):
//   1. A modal/sheet is open  → close it (Android convention)
//   2. Not on the dashboard   → jump DIRECTLY to /dashboard
//   3. On the dashboard       → minimize the app
// iOS has no back button and the wrapper no-ops on web, so this renders
// nothing everywhere else. Mounted inside BrowserRouter (needs navigation).
export default function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return onBackButton(() => {
      const openModal = document.querySelector('.modal.show');
      if (openModal) {
        // Respect modals that deliberately hide their close (mid-save):
        // swallow the press rather than navigating out from under them.
        openModal.querySelector('.btn-close')?.click();
        return;
      }
      if (location.pathname !== '/dashboard') {
        navigate('/dashboard');
        return;
      }
      minimizeApp();
    });
  }, [navigate, location.pathname]);

  return null;
}
