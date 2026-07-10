// Basic coverage for NetworkContext's kill switch + state machine.
// More sophisticated cases (debounce edge cases, browser event handling,
// online-recovery from offline) are deferred to a "high impact areas"
// follow-up — this file just locks down the load-bearing invariants:
//
//   - When the feature flag is unset, the provider is fully inert
//     (no probe traffic, `online` always true, chip never shows).
//   - When the flag is on and probes succeed, state stays at `online`.
//   - When the flag is on and probes fail consecutively past the miss
//     threshold, `showOfflineChip` flips to true.
//
// Each test re-imports the module after stubbing the env var because
// NETWORK_AWARE_ENABLED is captured at module-load time.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

function NetworkProbe({ useNetwork }) {
  const value = useNetwork();
  return <div data-testid="state">{JSON.stringify(value)}</div>;
}

async function loadContext(envValue) {
  vi.stubEnv('VITE_NETWORK_AWARE_RECOVERY', envValue);
  vi.resetModules();
  // useNetwork now lives in its own module; import both from the same fresh
  // post-reset graph so they share one NetworkContext object identity.
  const [{ NetworkProvider }, { useNetwork }] = await Promise.all([
    import('./NetworkContext.jsx'),
    import('./useNetwork.js'),
  ]);
  return { NetworkProvider, useNetwork };
}

describe('NetworkContext kill switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('feature disabled by default — provider is inert, no probe traffic', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const { NetworkProvider, useNetwork } = await loadContext(undefined);

    render(
      <NetworkProvider>
        <NetworkProbe useNetwork={useNetwork} />
      </NetworkProvider>,
    );

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.enabled).toBe(false);
    expect(state.online).toBe(true);
    expect(state.showOfflineChip).toBe(false);
    // The inert provider must not trigger any background fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("non-'true' value also disables (only literal 'true' opts in)", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const { NetworkProvider, useNetwork } = await loadContext('1');

    render(
      <NetworkProvider>
        <NetworkProbe useNetwork={useNetwork} />
      </NetworkProvider>,
    );

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('NetworkContext state machine (feature enabled)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('initial probe succeeds → confidently online, chip stays hidden', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const { NetworkProvider, useNetwork } = await loadContext('true');

    render(
      <NetworkProvider>
        <NetworkProbe useNetwork={useNetwork} />
      </NetworkProvider>,
    );

    // Flush the initial probe + its setState.
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.enabled).toBe(true);
    expect(state.online).toBe(true);
    expect(state.showOfflineChip).toBe(false);
  });

  test('three consecutive misses → showOfflineChip flips to true', async () => {
    // Every probe fails (network down / 5xx). Threshold is 3 misses; after
    // the third the provider should expose showOfflineChip=true.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const { NetworkProvider, useNetwork } = await loadContext('true');

    render(
      <NetworkProvider>
        <NetworkProbe useNetwork={useNetwork} />
      </NetworkProvider>,
    );

    // Drive through the initial tick + 2 subsequent ticks (7s checking poll
    // between). Use generous advances to clear the await fetch + setState
    // microtask chain after each tick.
    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(8000);
    }

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.showOfflineChip).toBe(true);
    expect(state.online).toBe(false);
  });

  test('debounce: one missed probe does not flip the chip', async () => {
    // Single failure should leave the chip hidden — that's the whole point
    // of the internal `checking` state. The first miss happens immediately
    // on mount; we assert no offline-flip after just that one tick.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blip'));
    const { NetworkProvider, useNetwork } = await loadContext('true');

    render(
      <NetworkProvider>
        <NetworkProbe useNetwork={useNetwork} />
      </NetworkProvider>,
    );

    // Just the initial probe — don't advance into the second tick.
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.showOfflineChip).toBe(false);
    // Public `online` is still true during `checking` — that's the whole
    // contract: external consumers must not see a flap from one missed
    // probe. The internal status would be 'checking' but is intentionally
    // not exposed.
    expect(state.online).toBe(true);
  });
});
