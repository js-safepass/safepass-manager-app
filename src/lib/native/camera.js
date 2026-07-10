// Native camera bridge — uses Capacitor Camera plugin on native for higher quality
// photos and native permission UX. Falls back to getUserMedia() on web (existing
// cameraCapture.js handles that path).
//
// The native camera captures a still photo via the OS camera UI, bypassing the
// getUserMedia stream entirely. This gives us better quality, native permission
// dialogs, and satisfies Apple's App Store review for native functionality.

import { isNative } from '../platform.js';

let Camera, CameraResultType, CameraSource, CameraDirection;

if (isNative) {
  ({ Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera'));
}

/**
 * Check whether we should use the native camera flow.
 * When true, Photo.jsx should use captureNativePhoto() instead of getUserMedia().
 */
export function shouldUseNativeCamera() {
  return isNative;
}

/**
 * Capture a photo using the native camera.
 * Returns { blob, url, width, height, contentType } matching the shape
 * that Photo.jsx expects from onPhotoCaptured.
 *
 * @param {Object} options
 * @param {number} options.width  - Desired width (default 1280)
 * @param {number} options.height - Desired height (default 720)
 * @param {number} options.quality - JPEG quality 0-100 (default 90)
 * @returns {Promise<{ blob: Blob, url: string, width: number, height: number, contentType: string, size: number }>}
 */
export async function captureNativePhoto({ width = 1280, height = 720, quality = 90 } = {}) {
  if (!isNative) {
    throw new Error('Native camera is not available in the browser.');
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    direction: CameraDirection.Front,
    width,
    height,
    quality,
    allowEditing: false,
    correctOrientation: true,
  });

  // Convert the native file URI to a blob for upload
  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    width,
    height,
    contentType: `image/${photo.format || 'jpeg'}`,
    size: blob.size,
  };
}

/**
 * Check camera permissions without triggering the camera.
 * Useful for pre-flight checks during setup.
 */
export async function checkCameraPermission() {
  if (!isNative) return 'granted'; // Web handles its own permissions via getUserMedia
  try {
    const status = await Camera.checkPermissions();
    return status.camera; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'prompt';
  }
}

/**
 * Request camera permissions explicitly.
 */
export async function requestCameraPermission() {
  if (!isNative) return 'granted';
  try {
    const status = await Camera.requestPermissions({ permissions: ['camera'] });
    return status.camera;
  } catch {
    return 'denied';
  }
}
