import { test, expect } from 'vitest';
import { createKioskApi, KioskApiError } from './kioskApi.js';

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

test('kioskFetch refresh interceptor retries once on KIOSK_SESSION_REFRESH_REQUIRED', async () => {
  const originalFetch = globalThis.fetch;
  let refreshTriggers = 0;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return jsonResponse(401, {
        title: 'Unauthorized',
        status: 401,
        code: 'KIOSK_SESSION_REFRESH_REQUIRED',
        detail: 'Refresh required.',
      });
    }
    return jsonResponse(200, { data: { ok: true } });
  };

  try {
    const api = createKioskApi({
      baseUrl: 'https://api.local',
      getKioskJwt: () => 'jwt-token',
      onSessionRefreshRequired: async () => {
        refreshTriggers += 1;
      },
    });

    const result = await api.listOrgs({ useKioskJwt: true });
    expect(refreshTriggers).toBe(1);
    expect(fetchCalls).toBe(2);
    expect(result?.data?.ok).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('kioskFetch does not loop if retry still returns KIOSK_SESSION_REFRESH_REQUIRED', async () => {
  const originalFetch = globalThis.fetch;
  let refreshTriggers = 0;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse(401, {
      title: 'Unauthorized',
      status: 401,
      code: 'KIOSK_SESSION_REFRESH_REQUIRED',
      detail: 'Refresh required.',
    });
  };

  try {
    const api = createKioskApi({
      baseUrl: 'https://api.local',
      getKioskJwt: () => 'jwt-token',
      onSessionRefreshRequired: async () => {
        refreshTriggers += 1;
      },
    });

    await expect(api.listOrgs({ useKioskJwt: true })).rejects.toMatchObject({
      code: 'KIOSK_SESSION_REFRESH_REQUIRED',
    });
    expect(refreshTriggers).toBe(1);
    expect(fetchCalls).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
