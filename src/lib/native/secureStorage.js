// Thin wrapper around the app-local SecureStorage Capacitor plugin
// (ios/App/App/SecureStoragePlugin.swift — Keychain;
//  android/.../SecureStoragePlugin.java — Keystore AES-GCM).
// Ported from the kiosk chassis per D12; custody rules live in
// docs/session-persistence-plan.md.
//
// On native: hardware-backed secure storage. On web: get() returns null and
// set()/remove() are no-ops — web sessions stay deliberately non-persistent
// (staging QA re-logs in; prod web is app-gated anyway).

import { registerPlugin } from '@capacitor/core';
import { isNative } from '../platform.js';

const SecureStorage = registerPlugin('SecureStorage');

/** Persist a string value (native only; no-op on web). Overwrites. */
export async function secureStorageSet(key, value) {
  if (!isNative) return;
  await SecureStorage.set({ key, value });
}

/** Read a string value (native only). Null on web or when absent. */
export async function secureStorageGet(key) {
  if (!isNative) return null;
  const result = await SecureStorage.get({ key });
  return result?.value ?? null;
}

/** Remove a value (native only; no-op on web). Silent when absent. */
export async function secureStorageRemove(key) {
  if (!isNative) return;
  await SecureStorage.remove({ key });
}
