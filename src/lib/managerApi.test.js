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

test('updateVisitor sends If-Match when given a version', async () => {
  const originalFetch = globalThis.fetch;
  const calls = captureFetch(jsonResponse(200, { data: { id: 'visitor_1' } }));
  try {
    const api = createManagerApi({
      baseUrl: 'https://api.local',
      getAccessToken: () => 'jwt-token',
    });
    await api.updateVisitor('visitor_1', { notes: 'x' }, { ifMatch: '"4"' });
    expect(calls[0].init.headers.get('If-Match')).toBe('"4"');
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
