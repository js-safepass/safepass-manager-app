// Browser-session cleanup for a REAL logout — the shape ported from
// sentinel-ui (src/lib/sessionCleanup.js: purgeBrowserSession +
// buildHostedLogoutUrl), scaled to this app's storage model (2026-07-18).
//
// A real logout is two halves, in order:
//   1. purgeBrowserSession() — scrub every piece of local session residue.
//      This app keeps tokens IN MEMORY only (never web storage), so there is
//      no credential material to destroy here; what remains is auth-adjacent:
//      sessionStorage (PKCE verifier/state + the stashed return path) and the
//      safepass.* selection keys in localStorage (active org + per-org scope
//      — org membership is authorization data, so a signed-out browser should
//      not advertise it).
//   2. redirectToHostedLogout() — navigate to the Cognito hosted
//      `/logout?client_id=…&logout_uri=…` endpoint. This is the ONLY way to
//      kill the Cognito managed-login SSO cookie: it lives on the auth
//      domain, out of this origin's reach. Skipping this step means the next
//      sign-in silently re-authenticates WITHOUT credentials — the bug class
//      found in the web-UI QA.
//
// AuthContext.signOut is the wiring; this module is framework-free and
// unit-tested.

import { buildLogoutUrl } from './cognitoHostedUi.js';

// Everything the app persists in localStorage is namespaced `safepass.`
// (state/SessionContext.jsx) — same prefix sentinel-ui purges on logout.
const LOCAL_STORAGE_PREFIXES = ['safepass.'];

function shouldRemoveLocalKey(key) {
  return Boolean(key) && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Storages are injectable for tests only (the vitest jsdom environment ships
// a method-less localStorage stub); production callers use the defaults.
export function purgeBrowserSession({
  session = window.sessionStorage,
  local = window.localStorage,
} = {}) {
  // sessionStorage holds only transient auth plumbing (manager_pkce_verifier /
  // manager_pkce_state in pages/Login.jsx, manager_return_to in returnPath.js)
  // — clear it wholesale.
  try {
    session.clear();
  } catch {
    // Storage unavailable (private mode / disabled) — nothing persisted then.
  }

  try {
    // Collect first, remove after: removing while iterating by index skips keys.
    const doomed = [];
    for (let i = 0; i < local.length; i += 1) {
      const key = local.key(i);
      if (shouldRemoveLocalKey(key)) doomed.push(key);
    }
    for (const key of doomed) {
      try {
        local.removeItem(key);
      } catch {
        // Best effort — a stuck key only leaves a display preference behind.
      }
    }
  } catch {
    // Storage unavailable — nothing persisted then.
  }
}

// Navigates the top-level window to the Cognito hosted /logout endpoint,
// which clears the managed-login SSO cookie and then redirects back to this
// origin's registered logout_uri (/auth/logout). Returns false (without
// navigating) when the hosted-UI config is missing — the caller has already
// cleared local state, so a config fault degrades to a local-only sign-out
// instead of throwing. `navigate` is injectable for tests only.
export function redirectToHostedLogout({ navigate } = {}) {
  let url;
  try {
    url = buildLogoutUrl();
  } catch {
    return false;
  }
  const go = navigate || ((target) => window.location.assign(target));
  go(url);
  return true;
}
