/* global __APP_BUILD_ID__ */
// Auto-update for long-running sessions (decision #6 in docs/build-plan.md).
//
// This is an attended staff app, but a front-desk tablet or PC commonly sits
// open on it all day without a reload — so a Cloudflare deploy never reaches
// that running session until someone manually refreshes. (Inherited from the
// kiosk chassis, where the same staleness once left devices running an
// obsolete bundle for days.)
//
// This module closes that gap: while the app is idle (no modal or flow open —
// never reload mid-interaction), the shell polls checkForDeployedUpdate on an
// interval (UPDATE_CHECK_INTERVAL_MS). It compares the bundle's own build id
// against the deployed /version.json and reloads when they differ.
//
// Build wiring (vite.config.js): __APP_BUILD_ID__ is injected into the bundle
// at build time, and the same id is emitted to /version.json. A new deploy
// advances both in lockstep, so a stale running bundle detects the mismatch.

// How often the shell polls for a new deploy while idle.
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Reloads toward a single deployed build id are capped at this many attempts.
// Without a cap, a reload that never takes effect (a no-op / interrupted reload
// on WebKit/Capacitor) or a bundle⇄version.json drift would either strand the
// session after one try or loop forever. A small bound retries a transient failed
// reload a few times, then gives up loudly until the next cold start.
export const MAX_RELOAD_ATTEMPTS = 3;

// Abort the version probe if it hasn't responded in this long. Bounds a
// half-open connection (server accepts but never replies) rather than relying
// on the WebView's long, platform-dependent default. version.json is tiny, so
// this won't trip a slow-but-working link; on abort we just wait for the next
// poll window. The abort rejects the fetch, handled like any probe failure.
export const VERSION_FETCH_TIMEOUT_MS = 8000;

// Injected by Vite `define`. Guarded with typeof so tests / non-build contexts
// that don't replace it don't throw a ReferenceError.
const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : null;

// sessionStorage key holding { buildId, attempts } — how many times we've
// reloaded toward a given deployed build. sessionStorage survives a reload but
// is cleared on cold start, exactly the lifetime we want for the attempt count.
const RELOAD_GUARD_KEY = 'safepass.manager.updateReload';

// Pure decision: should the app reload to pick up a newer build? Kept free of
// I/O and globals so it can be exhaustively unit-tested. `attempts` is how many
// times we've already reloaded toward `remoteBuildId`.
export function shouldReload({
  currentBuildId,
  remoteBuildId,
  attempts = 0,
  maxAttempts = MAX_RELOAD_ATTEMPTS,
}) {
  if (!currentBuildId || !remoteBuildId) return false; // unknown id → never reload
  if (remoteBuildId === currentBuildId) return false; // already on the live build
  if (attempts >= maxAttempts) return false; // exhausted retries → stop (no loop, no perma-stick)
  return true;
}

export function getCurrentBuildId() {
  return CURRENT_BUILD_ID;
}

// Returns { buildId, attempts } — the build we last reloaded toward and how
// many times. Defaults are safe when storage is empty/unavailable/corrupt.
function readReloadGuard() {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return { buildId: null, attempts: 0 };
    const parsed = JSON.parse(raw);
    return { buildId: parsed?.buildId ?? null, attempts: parsed?.attempts ?? 0 };
  } catch {
    return { buildId: null, attempts: 0 };
  }
}

function writeReloadGuard(buildId, attempts) {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ buildId, attempts }));
  } catch {
    // sessionStorage unavailable (disabled / private) — proceed without the
    // attempt guard rather than blocking a legitimate update.
  }
}

// Fetches the deployed build id and reloads the page when a newer build is
// live. Safe to call repeatedly; a no-op unless a genuinely different build is
// deployed (and we haven't already exhausted retries toward it). Never throws —
// any failure (offline, non-200, parse error) is swallowed so it can never
// wedge the running app. `reload` is injectable for tests.
export async function checkForDeployedUpdate({ reload } = {}) {
  if (!CURRENT_BUILD_ID) return false;

  let remoteBuildId = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS);
  try {
    // Cache-bust both the WebView and the CF edge so we read the live id.
    const res = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json();
    remoteBuildId = data?.buildId ?? null;
  } catch {
    // Network error, non-2xx, malformed JSON, or the timeout abort — all mean
    // "can't tell what's deployed, so don't reload." Retry next poll window.
    return false;
  } finally {
    clearTimeout(timeoutId);
  }

  const guard = readReloadGuard();
  // Attempts only accumulate against the current target; a newer deploy (a
  // different remoteBuildId) resets the count so it always gets its own tries.
  const attempts = guard.buildId === remoteBuildId ? guard.attempts : 0;

  if (!shouldReload({ currentBuildId: CURRENT_BUILD_ID, remoteBuildId, attempts })) {
    if (remoteBuildId && remoteBuildId !== CURRENT_BUILD_ID && attempts >= MAX_RELOAD_ATTEMPTS) {
      // Reloaded the cap's worth of times and still on the old bundle — the
      // reload is being ignored, or the bundle and /version.json have drifted.
      // console.error survives the prod console strip.
      console.error(
        '[appUpdate] deployed build', remoteBuildId,
        'still not active after', attempts, 'reload attempts (running:', CURRENT_BUILD_ID,
        ') — giving up until cold start',
      );
    }
    return false;
  }

  writeReloadGuard(remoteBuildId, attempts + 1);
  (reload || (() => window.location.reload()))();
  return true;
}
