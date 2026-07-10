// Haptic feedback — uses Capacitor Haptics plugin on native, no-op on web.
// Call these from UI interaction handlers (button taps, confirmations, errors).

import { isNative } from '../platform.js';

let Haptics, ImpactStyle, NotificationType;

if (isNative) {
  ({ Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics'));
}

/** Light tap — use for standard button presses. */
export async function tapLight() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

/** Medium tap — use for significant actions (photo capture, step transitions). */
export async function tapMedium() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {}
}

/** Heavy tap — use for confirmations (check-in complete). */
export async function tapHeavy() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {}
}

/** Success notification — use after successful check-in. */
export async function notifySuccess() {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {}
}

/** Warning notification — use for validation issues. */
export async function notifyWarning() {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {}
}

/** Error notification — use for failures. */
export async function notifyError() {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {}
}
