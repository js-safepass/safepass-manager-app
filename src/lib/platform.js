// Detect whether the app is running inside a Capacitor native shell (iOS/Android)
// or in a standard browser. This allows code to branch between native plugin calls
// and web API fallbacks without pulling in Capacitor as a hard dependency for the
// web build.

import { Capacitor } from '@capacitor/core';

/** true when running inside the native iOS or Android shell */
export const isNative = Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' */
export const platform = Capacitor.getPlatform();

export const isIOS = platform === 'ios';
export const isAndroid = platform === 'android';
export const isWeb = platform === 'web';
