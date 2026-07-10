// Capacitor's native console bridge serializes Error objects as `{}` because
// Error's own properties (message, stack, etc.) are not enumerable. The same
// happens for KioskApiError if it extends Error without overriding toJSON.
// Use this helper to flatten an error into a plain object whose fields will
// survive the JS->native bridge intact, so Web Inspector / Xcode logs show
// the actual code/status/message instead of `{}`.

export function flattenErrorForLog(error) {
  if (error === null || error === undefined) {
    return { value: String(error) };
  }
  if (typeof error !== 'object') {
    return { value: String(error) };
  }
  const flat = {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    // KioskApiError.details often carries the server's RFC7807 body (the
    // real reason). Surface it directly so it doesn't get lost.
    details: error.details,
    retryAfter: error.retryAfter,
    stack: typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 6).join(' | ') : undefined,
  };
  // Strip undefined keys so the log line stays readable.
  Object.keys(flat).forEach((key) => {
    if (flat[key] === undefined) delete flat[key];
  });
  return flat;
}
