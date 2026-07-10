// Native app lifecycle — handles back button, app state changes, and URL opens.
// Uses Capacitor App plugin on native, no-op on web.

import { isNative, isAndroid } from '../platform.js';

let AppPlugin;

if (isNative) {
  ({ App: AppPlugin } = await import('@capacitor/app'));
}

/**
 * Register a handler for Android hardware back button.
 * In kiosk mode, we want to prevent the user from leaving the app.
 * Returns an unsubscribe function.
 */
export function onBackButton(handler) {
  if (!isNative || !isAndroid) return () => {};
  const listener = AppPlugin.addListener('backButton', handler);
  return () => listener.then((l) => l.remove());
}

/**
 * Register a handler for app state changes (foreground/background).
 * Useful for refreshing sessions when the app comes back to foreground.
 * Returns an unsubscribe function.
 *
 * @param {(state: { isActive: boolean }) => void} handler
 */
export function onAppStateChange(handler) {
  if (!isNative) return () => {};
  const listener = AppPlugin.addListener('appStateChange', handler);
  return () => listener.then((l) => l.remove());
}

/**
 * Minimize the app (Android only). No-op on iOS where apps can't self-minimize.
 */
export async function minimizeApp() {
  if (!isNative || !isAndroid) return;
  try {
    await AppPlugin.minimizeApp();
  } catch {}
}
