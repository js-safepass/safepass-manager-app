import { test, expect } from 'vitest';
import { createManagerApi, ManagerApiError, isMutating } from './managerApi.js';

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

function captureFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response(calls.length) : response.clone();
  };
  return calls;
}

test('managerFetch sends bearer, request id, and auto Idempotency-Key on mutations', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(201, { data: { id: 'visitor_1' } }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    await api.createVisitor({ first_name: 'Jane' });

    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token');
    expect(headers.get('X-Request-Id')).toBeTruthy();
    expect(headers.get('Idempotency-Key')).toBeTruthy();
    expect(calls[0].url).toBe('https://api.local/v1/visitors');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('managerFetch does not send Idempotency-Key on GETs', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: [], meta: { limit: 50 } }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    await api.listVisitors({ org_id: 'org_1', name: 'doe', cursor: undefined });

    expect(calls[0].init.headers.get('Idempotency-Key')).toBeNull();
    // Query builder skips undefined params.
    expect(calls[0].url).toBe('https://api.local/v1/visitors?org_id=org_1&name=doe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updateVisitor sends If-Match as the plain integer version string', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: { id: 'visitor_1' } }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    // The sentinel-ui convention: If-Match carries data.version as-is
    // (no quotes, no W/ prefix) — the backend compares versions, not ETags.
    await api.updateVisitor('visitor_1', { notes: 'x' }, { ifMatch: 4 });
    expect(calls[0].init.headers.get('If-Match')).toBe('4');
    expect(calls[0].init.method).toBe('PATCH');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RFC7807 problem+json errors surface code/status/detail on ManagerApiError', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        title: 'Precondition Required',
        status: 428,
        code: 'REVIEW_REQUIRED',
        detail: 'Visitor requires review before check-in.',
      }),
      { status: 428, headers: { 'content-type': 'application/problem+json' } },
    );
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    const error = await api.checkin('visitor_1', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ManagerApiError);
    expect(error.code).toBe('REVIEW_REQUIRED');
    expect(error.status).toBe(428);
    expect(error.requestId).toBeTruthy();
    expect(error.message).toMatch(/review/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Retry-After header lands on error.retryAfter (seconds)', async () => {
  const originalFetch = globalThis.fetch;
  captureFetch(
    jsonResponse(
      429,
      { title: 'Too Many Requests', status: 429, code: 'CHECKIN_QUEUE_FULL' },
      { 'Retry-After': '7' },
    ),
  );
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    const error = await api.checkin('visitor_1', {}).catch((e) => e);
    expect(error.retryAfter).toBe(7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing access token throws UNAUTHORIZED without hitting the network', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: {} }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => null,
    });
    const error = await api.whoami().catch((e) => e);
    expect(error).toBeInstanceOf(ManagerApiError);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(calls).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attachProof hook sets the DPoP header when provided (deferred-hardening seam)', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: {} }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
      attachProof: async ({ method, url, bearer }) => `proof:${method}:${url}:${bearer ? 'y' : 'n'}`,
    });
    await api.whoami();
    expect(calls[0].init.headers.get('DPoP')).toBe('proof:GET:https://api.local/v1/whoami:y');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('isMutating classifies methods', () => {
  expect(isMutating('POST')).toBe(true);
  expect(isMutating('patch')).toBe(true);
  expect(isMutating('GET')).toBe(false);
});

test('401 forces one refresh and retries with the new token and the SAME idempotency key', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' }), {
        status: 401, headers: { 'content-type': 'application/problem+json' },
      });
    }
    return new Response(JSON.stringify({ data: { id: 'visit_1' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  // Stateful accessor mirroring the real freshToken provider: a forced
  // refresh rotates the held token, and subsequent plain reads return it.
  let held = 'stale-token';
  let unauthorized = 0;
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: ({ forceRefresh } = {}) => {
        if (forceRefresh) held = 'fresh-token';
        return Promise.resolve(held);
      },
      onUnauthorized: () => { unauthorized += 1; },
    });
    const result = await api.checkin('visitor_1', {});
    expect(result?.data?.id).toBe('visit_1');
    expect(calls).toHaveLength(2);
    expect(calls[0].headers.get('Authorization')).toBe('Bearer stale-token');
    expect(calls[1].headers.get('Authorization')).toBe('Bearer fresh-token');
    // The retry replays the SAME idempotency key — one logical mutation.
    expect(calls[1].headers.get('Idempotency-Key')).toBe(calls[0].headers.get('Idempotency-Key'));
    expect(unauthorized).toBe(0); // recovered — the auth owner is not notified
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('401 with an unchanged token skips the retry and notifies onUnauthorized once', async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' }), {
      status: 401, headers: { 'content-type': 'application/problem+json' },
    });
  };
  let unauthorized = 0;
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => Promise.resolve('same-token'), // forceRefresh yields no change
      onUnauthorized: () => { unauthorized += 1; },
    });
    const error = await api.whoami().catch((e) => e);
    expect(error.status).toBe(401);
    expect(fetches).toBe(1); // no pointless replay with an identical token
    expect(unauthorized).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an accessor throw surfaces UNAUTHORIZED but preserves the cause for logging', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: {} }));
  const boom = new Error('provider exploded');
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => Promise.reject(boom),
    });
    const error = await api.whoami().catch((e) => e);
    expect(error).toBeInstanceOf(ManagerApiError);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.details?.cause).toBe(boom);
    expect(calls).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
