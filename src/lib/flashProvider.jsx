/* eslint-disable react-refresh/only-export-components -- ported verbatim from
   sentinel-ui, which co-locates the hook with its component; kept identical for
   upstream parity at the cost of fast-refresh on this file. */
// flashProvider.jsx
//
// Centralized flash/toast notification system.
// Provides useFlash() hook for any component to push overlay notifications.
// Auto-dismiss after a configurable timeout. Renders as a fixed overlay via FlashOverlay.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const FlashCtx = createContext(null);

let nextId = 1;

const DEFAULT_DURATION = {
  success: 6000,
  danger: 12000,
  warning: 10000,
  info: 8000,
};

/**
 * @typedef {{ id: number, variant: string, message: string, duration: number }} FlashItem
 */

export function FlashProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(({ variant = 'info', message, duration } = {}) => {
    const id = nextId++;
    const ms = duration ?? DEFAULT_DURATION[variant] ?? 8000;
    const item = { id, variant, message, duration: ms };

    setItems((prev) => [...prev, item]);

    if (ms > 0) {
      timersRef.current[id] = setTimeout(() => dismiss(id), ms);
    }

    return id;
  }, [dismiss]);

  // Convenience methods
  const success = useCallback((message, duration) => push({ variant: 'success', message, duration }), [push]);
  const error = useCallback((message, duration) => push({ variant: 'danger', message, duration }), [push]);
  const warning = useCallback((message, duration) => push({ variant: 'warning', message, duration }), [push]);
  const info = useCallback((message, duration) => push({ variant: 'info', message, duration }), [push]);

  const value = useMemo(() => ({
    items,
    push,
    dismiss,
    success,
    error,
    warning,
    info,
  }), [items, push, dismiss, success, error, warning, info]);

  return <FlashCtx.Provider value={value}>{children}</FlashCtx.Provider>;
}

/**
 * Hook to push flash notifications.
 *
 * Usage:
 *   const flash = useFlash();
 *   flash.success('Saved!');
 *   flash.error('Something went wrong.');
 *   flash.warning('Check your input.');
 *   flash.info('3 fields imported.');
 */
export function useFlash() {
  const ctx = useContext(FlashCtx);
  if (!ctx) throw new Error('useFlash must be used within <FlashProvider>');
  return ctx;
}

