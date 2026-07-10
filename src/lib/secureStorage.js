// Thin wrapper around the iOS-only SecureStorage Capacitor plugin
// (see ios/App/App/SecureStoragePlugin.swift).
//
// On native: reads/writes via iOS Keychain with
// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly.
// On web: returns null for get(); set()/remove() are no-ops. Web sessions
// are intentionally non-persistent (dev/admin contexts only).

import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform.js';

const SecureStorage = registerPlugin('SecureStorage');

/**
 * Persist a string value to iOS Keychain (native only). No-op on web.
 * Overwrites existing values for the same key.
 *
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function secureStorageSet(key, value) {
  if (!isNative) return;
  await SecureStorage.set({ key, value });
}

/**
 * Read a string value from iOS Keychain (native only). Returns null on web
 * or when the key is not present.
 *
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function secureStorageGet(key) {
  if (!isNative) return null;
  const result = await SecureStorage.get({ key });
  return result?.value ?? null;
}

/**
 * Remove a value from iOS Keychain (native only). No-op on web.
 * Succeeds silently if the key is not present.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function secureStorageRemove(key) {
  if (!isNative) return;
  await SecureStorage.remove({ key });
}
