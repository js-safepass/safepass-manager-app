import { useCallback, useEffect, useRef, useState } from 'react';
import { isPermissionError } from './managerApi.js';

const nowIso = () => new Date().toISOString();

/**
 * Scoped polling loop with hard cancellation semantics.
 * Prevents in-flight poll completions from re-scheduling after unmount/deactivation.
 *
 * Halt-on-permission-error: if `poll` rejects with a 403/404 (see
 * isPermissionError), the loop halts until `enabled` flips off→on or
 * intervalMs/scope deps change (which re-keys the run). Callers who want
 * this should rethrow permission errors from their poll callback after any
 * local logging. Other errors are tracked in stats but don't halt — the
 * backend may be transiently unhappy and we want to recover.
 */
export function useScopedPolling({
  channel,
  enabled = true,
  intervalMs = 30000,
  poll,
  requireVisible = true,
  requireFocused = false,
} = {}) {
  const pollRef = useRef(poll);
  const timerRef = useRef(null);
  const runIdRef = useRef(0);
  const haltedRef = useRef(false);

  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });
  const [isFocused, setIsFocused] = useState(() => {
    if (typeof document === 'undefined' || typeof document.hasFocus !== 'function') return true;
    return document.hasFocus();
  });

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!requireVisible || typeof document === 'undefined') return undefined;
    const onVisibilityChange = () => setIsVisible(document.visibilityState === 'visible');
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [requireVisible]);

  useEffect(() => {
    if (!requireFocused || typeof window === 'undefined') return undefined;
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    setIsFocused(typeof document?.hasFocus === 'function' ? document.hasFocus() : true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [requireFocused]);

  const updateStats = useCallback((updater) => {
    if (typeof window === 'undefined' || !channel) return;
    const current = window.__pollingStats || { channels: {} };
    const prev = current.channels?.[channel] || {};
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
    window.__pollingStats = {
      ...current,
      updatedAt: nowIso(),
      channels: {
        ...(current.channels || {}),
        [channel]: {
          channel,
          ...next,
        },
      },
    };
  }, [channel]);

  const canPoll = Boolean(
    enabled
    && Number(intervalMs) > 0
    && (!requireVisible || isVisible)
    && (!requireFocused || isFocused)
  );

  useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    haltedRef.current = false;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    updateStats((prev) => ({
      ...prev,
      enabled: Boolean(enabled),
      active: canPoll,
      intervalMs: Number(intervalMs) || 0,
      requireVisible: Boolean(requireVisible),
      requireFocused: Boolean(requireFocused),
      isVisible,
      isFocused,
      lastStateAt: nowIso(),
      ...(canPoll ? { lastStartLoopAt: nowIso() } : { lastStopAt: nowIso() }),
    }));

    if (!canPoll || typeof pollRef.current !== 'function') {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (runIdRef.current === runId) {
          runIdRef.current += 1;
        }
      };
    }

    const schedule = () => {
      if (runIdRef.current !== runId) return;
      timerRef.current = window.setTimeout(tick, Number(intervalMs));
    };

    const tick = async () => {
      if (runIdRef.current !== runId) return;
      updateStats((prev) => ({
        ...prev,
        running: true,
        runs: (prev.runs || 0) + 1,
        lastRunStartAt: nowIso(),
      }));
      try {
        await pollRef.current?.();
        updateStats((prev) => ({
          ...prev,
          lastRunOkAt: nowIso(),
        }));
      } catch (err) {
        const halted = isPermissionError(err);
        if (halted) haltedRef.current = true;
        updateStats((prev) => ({
          ...prev,
          errors: (prev.errors || 0) + 1,
          lastErrorAt: nowIso(),
          lastErrorMessage: err?.message || String(err),
          ...(halted ? { halted: true, haltedAt: nowIso(), haltedStatus: err?.status } : {}),
        }));
      } finally {
        updateStats((prev) => ({
          ...prev,
          running: false,
          lastRunEndAt: nowIso(),
        }));
        if (runIdRef.current === runId && !haltedRef.current) {
          schedule();
        }
      }
    };

    schedule();
    return () => {
      if (runIdRef.current === runId) {
        runIdRef.current += 1;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      updateStats((prev) => ({
        ...prev,
        active: false,
        running: false,
        lastStopAt: nowIso(),
      }));
    };
  }, [enabled, intervalMs, canPoll, requireVisible, requireFocused, isVisible, isFocused, updateStats]);
}
