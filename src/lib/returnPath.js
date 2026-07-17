// Return-path custody for the "resume" half of 401 -> re-auth -> resume
// (auth-contract §5). When a live session starts 401-ing (token expiry or a
// server-side global sign-out on password change/revocation), the user is
// bounced through the Hosted-UI redirect,
// which unloads the SPA. We stash where they were just before the redirect and
// restore it on the callback, so they land back on the same screen instead of
// the dashboard — the in-flight request itself can't survive a full-page
// redirect, but the navigation state can.
//
// Framework-free and unit-tested; pages/Login.jsx is the only wiring.

const RETURN_TO_KEY = 'manager_return_to';

// Only same-origin absolute in-app paths are honored; an /auth/* path (the
// callback/logout routes) or anything cross-origin is rejected as an
// open-redirect guard and falls back to root.
function isSafeReturnPath(path) {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.startsWith('/auth/')
  );
}

// Capture the current in-app location so a re-auth redirect can resume there.
// No-op for auth/cross-origin paths (nothing to resume to).
export function stashReturnTo(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  try {
    if (isSafeReturnPath(pathname)) {
      window.sessionStorage.setItem(RETURN_TO_KEY, `${pathname}${search || ''}`);
    }
  } catch {
    // sessionStorage unavailable — resume just falls back to root.
  }
}

// Read-and-clear the stashed return path, validated. Returns '/' when nothing
// safe is stored.
export function consumeReturnTo() {
  let value = null;
  try {
    value = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    return '/';
  }
  return isSafeReturnPath(value) ? value : '/';
}
