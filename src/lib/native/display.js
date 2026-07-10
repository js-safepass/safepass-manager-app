// Native display management — wake lock, status bar, screen orientation.
// Uses Capacitor plugins when available, falls back to web APIs.

import { isNative } from '../platform.js';

let StatusBar, ScreenOrientation;

if (isNative) {
  ({ StatusBar } = await import('@capacitor/status-bar'));
  ({ ScreenOrientation } = await import('@capacitor/screen-orientation'));
}

/** Hide the status bar for a true kiosk experience (native only). */
export async function hideStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.hide();
  } catch {
    // Non-fatal — some Android devices restrict this.
  }
}

/** Show the status bar (e.g. when exiting kiosk mode). */
export async function showStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.show();
  } catch {}
}

/** Lock screen orientation to landscape (native or web fallback). */
export async function lockLandscape() {
  if (isNative) {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
      return;
    } catch {}
  }
  // Web fallback — works on some Android browsers
  screen.orientation?.lock?.('landscape').catch(() => {});
}

/** Unlock orientation so the OS can rotate freely. */
export async function unlockOrientation() {
  if (isNative) {
    try {
      await ScreenOrientation.unlock();
      return;
    } catch {}
  }
  screen.orientation?.unlock?.();
}

/**
 * Disable the idle timer so the screen stays on (native).
 * On web, this is handled by the Wake Lock API in useKioskDisplay.js.
 * On native iOS/Android, Capacitor keeps the WebView process alive and
 * we disable the idle timer via the native app delegate / activity —
 * this is configured in the Xcode/Android project directly.
 *
 * For iOS: UIApplication.shared.isIdleTimerDisabled = true
 *   → set in ios/App/App/AppDelegate.swift
 * For Android: getWindow().addFlags(FLAG_KEEP_SCREEN_ON)
 *   → set in android/app/src/main/java/.../MainActivity.java
 */
export function keepScreenOn() {
  // Placeholder — actual implementation is in native code.
  // The web fallback (Wake Lock API) continues to work in useKioskDisplay.js.
}
