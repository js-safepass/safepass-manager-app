// Centralized API client for the SafePass Manager app.
//
// Every backend call in the app goes through createManagerApi — this is the
// contractual "single request seam" from the requirements brief: the deferred
// session-hardening phase (sender-constrained DPoP sessions, action-scoped
// step-up re-auth) must retrofit here without touching call sites. Do not
// call fetch() against api.safepass.com anywhere else.
//
// Cross-cutting API behaviors owned here (per the brief §5 and the OpenAPI
// spec in docs/contractor-handoff/):
//   - Authorization: Cognito access token as a plain bearer (attended app,
//     no device session — decision #4/#5 in docs/build-plan.md).
//   - Idempotency-Key on every mutating request so retries are safe.
//   - If-Match support for ETag-versioned updates (pass options.ifMatch).
//   - RFC7807 problem+json parsing onto ManagerApiError with the stable
//     `code` — callers branch on code, never on free-text detail.
//   - X-Request-Id per request, surfaced on errors for support.
//   - Retry-After header surfaced onto error.retryAfter for retry.js.

export class ManagerApiError extends Error {
  constructor(message, { code, status, details, retryAfter, requestId } = {}) {
    super(message);
    this.name = 'ManagerApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    // Server-suggested retry delay (seconds), from the Retry-After response
    // header, so retry.js can honor it even if the body omits it.
    this.retryAfter = retryAfter;
    // X-Request-Id we sent — quote it in support/bug reports.
    this.requestId = requestId;
  }
}

const mutatingMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function isMutating(method) {
  return mutatingMethods.has(method.toUpperCase());
}

// 403/404 both read as "not yours to see" (tenant-safe 404s are deliberate
// anti-leak behavior). Polling loops halt on these instead of retrying into
// a wall — same contract as sentinel-ui's datamanager/helpers.js.
export function isPermissionError(err) {
  const status = err?.status;
  return status === 403 || status === 404;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

// RFC7807 problem bodies put code/title/detail at the top level; some legacy
// endpoints nest under `error`. Accept both, prefer the stable `code`.
function parseErrorPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { code: undefined, message: undefined };
  }
  const error = payload.error || payload;
  return {
    code: error.code,
    message: error.message || error.detail || error.title,
  };
}

async function readPayload(response) {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  // Covers application/json AND application/problem+json (RFC7807 errors).
  if (contentType.includes('json')) {
    return response.json();
  }
  return response.text();
}

// Builds "/v1/visitors?org_id=...&cursor=..." from a params object, skipping
// null/undefined/'' so callers can pass optional filters unconditionally.
function withQuery(path, params) {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function createManagerApi({
  baseUrl,
  getAccessToken,
  // Deferred DPoP seam (decision #5 in docs/build-plan.md): when the backend
  // grows a manager-surface sender-constrained session, wire a proof builder
  // here — `attachProof({ method, url, bearer })` returning the DPoP header
  // value — and every call site is covered. Not used today.
  attachProof,
}) {
  const root = normalizeBaseUrl(baseUrl);

  async function managerFetch(req, options = {}) {
    const { method, path, body, idempotencyKey } = req;
    if (!path.startsWith('/v1/')) {
      throw new Error(`API path must start with /v1/: ${path}`);
    }

    const url = `${root}${path}`;
    const headers = new Headers();
    const requestId = crypto.randomUUID();
    headers.set('X-Request-Id', requestId);

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const bearer = getAccessToken?.();
    if (!bearer) {
      // In-memory token is gone (page refresh, expiry) — callers route this
      // to re-auth via getUserFacingError / the auth context.
      throw new ManagerApiError('Sign-in required', {
        code: 'UNAUTHORIZED',
        status: 401,
      });
    }
    headers.set('Authorization', `Bearer ${bearer}`);

    // Mutations always carry an Idempotency-Key (auto-generated unless the
    // caller supplies one to span an explicit retry loop).
    if (isMutating(method)) {
      headers.set('Idempotency-Key', idempotencyKey || crypto.randomUUID());
    }

    // Version concurrency: If-Match carries the resource's integer `version`
    // as a plain string (NOT the quoted ETag) — matches sentinel-ui's
    // datamanager convention (core.js/visitorsApi.js, verified 2026-07-10).
    // Missing where required → 428; stale version → 409: re-fetch and retry.
    if (options.ifMatch !== undefined && options.ifMatch !== null) {
      headers.set('If-Match', String(options.ifMatch));
    }

    if (attachProof) {
      const proof = await attachProof({ method, url, bearer });
      if (proof) headers.set('DPoP', proof);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await readPayload(response);

    if (response.ok) return payload;

    const { code, message } = parseErrorPayload(payload);
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new ManagerApiError(message || `Request failed with ${response.status}`, {
      code,
      status: response.status,
      details: payload,
      requestId,
      retryAfter: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : undefined,
    });
  }

  // Endpoint surface: exactly the `x-apps: visitor` + `shared` operations in
  // docs/contractor-handoff/3-api-spec.yaml. Methods are stubbed ahead of
  // their screens; add options (expand, filters) as flows get built.
  return {
    request: managerFetch,

    // --- Auth / bootstrap (shared) ---
    whoami: () =>
      managerFetch({ method: 'GET', path: '/v1/whoami' }),
    listAuthScopes: () =>
      managerFetch({ method: 'GET', path: '/v1/auth/scopes' }),
    getScopeTree: (orgId) =>
      managerFetch({ method: 'GET', path: `/v1/orgs/${orgId}/scope-tree` }),

    // --- Visitors ---
    listVisitors: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/visitors', params) }),
    getVisitor: (visitorId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/visitors/${visitorId}`, params) }),
    createVisitor: (payload, { idempotencyKey } = {}) =>
      managerFetch({ method: 'POST', path: '/v1/visitors', body: payload, idempotencyKey }),
    updateVisitor: (visitorId, payload, { ifMatch } = {}) =>
      managerFetch(
        { method: 'PATCH', path: `/v1/visitors/${visitorId}`, body: payload },
        { ifMatch },
      ),
    uploadVisitorPhoto: (visitorId, payload) =>
      managerFetch({ method: 'POST', path: `/v1/visitors/${visitorId}/photos`, body: payload }),
    faceReindexVisitor: (visitorId) =>
      managerFetch({ method: 'POST', path: `/v1/visitors/${visitorId}/face-reindex` }),
    bulkImportVisitors: (payload) =>
      managerFetch({ method: 'POST', path: '/v1/visitors/bulk', body: payload }),

    // --- Check-in (front-desk fallback path) ---
    checkinPreflight: (visitorId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visitors/${visitorId}/checkin/preflight`, body: payload }),
    checkin: (visitorId, payload, { idempotencyKey } = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visitors/${visitorId}/checkin`, body: payload, idempotencyKey }),
    listScheduledCheckins: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/checkin/scheduled', params) }),

    // --- Visits ---
    listVisits: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/visits', params) }),
    getVisit: (visitId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/visits/${visitId}`, params) }),
    createVisit: (payload, { idempotencyKey } = {}) =>
      managerFetch({ method: 'POST', path: '/v1/visits', body: payload, idempotencyKey }),
    updateVisit: (visitId, payload, { ifMatch } = {}) =>
      managerFetch(
        { method: 'PATCH', path: `/v1/visits/${visitId}`, body: payload },
        { ifMatch },
      ),
    // Note: sentinel-ui's CheckInModal/useVisitFlow also use
    // POST /v1/visits/{id}/confirm (with check_cleared for background-check
    // orgs). That path is NOT in the contractor OpenAPI subset — confirm with
    // backend that it belongs on this app's allowlist before Phase 3.
    confirmVisit: (visitId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/confirm`, body: payload }),
    checkoutVisit: (visitId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/checkout`, body: payload }),
    completeVisit: (visitId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/complete`, body: payload }),
    cancelVisit: (visitId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/cancel`, body: payload }),
    assignBadge: (visitId, payload) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/assign-badge`, body: payload }),
    rerenderBadge: (visitId, payload = {}) =>
      managerFetch({ method: 'POST', path: `/v1/visits/${visitId}/rerender-badge`, body: payload }),
    listVisitEvents: (visitId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/visits/${visitId}/events`, params) }),

    // --- Stations / org hierarchy (read-only in this app) ---
    listStations: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/stations`, params) }),
    listDivisions: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/divisions`, params) }),
    listLocations: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/locations`, params) }),
    listBuildings: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/buildings`, params) }),

    // --- Host contacts ---
    listHostContacts: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/host-contacts`, params) }),
    suggestHostContacts: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/host-contacts/suggest`, params) }),
    getHostContact: (orgId, hostContactId) =>
      managerFetch({ method: 'GET', path: `/v1/orgs/${orgId}/host-contacts/${hostContactId}` }),

    // --- Notifications ---
    listNotifications: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/notifications', params) }),
    markNotificationRead: (notificationId) =>
      managerFetch({ method: 'POST', path: `/v1/notifications/${notificationId}/read` }),
    markNotificationsRead: (payload) =>
      managerFetch({ method: 'POST', path: '/v1/notifications/read', body: payload }),
    createNotificationStreamTicket: () =>
      managerFetch({ method: 'POST', path: '/v1/notifications/stream-ticket' }),

    // --- Metrics (dashboard; response shapes PROVISIONAL in the spec —
    // confirm frozen with backend before building, decision #10) ---
    getMetrics: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/metrics', params) }),
    getCheckinOpsMetrics: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/metrics/checkin-ops', params) }),
    getMetricsTimeseries: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/metrics/timeseries', params) }),
    getLiveMetricsTimeseries: (params) =>
      managerFetch({ method: 'GET', path: withQuery('/v1/metrics/timeseries/live', params) }),

    // --- Tracking (read-only rendering; floorplan config comes with it) ---
    getTrackingMap: (orgId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/orgs/${orgId}/tracking/map`, params) }),
    getVisitTracking: (visitId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/visits/${visitId}/tracking`, params) }),
    getVisitTrackingTrace: (visitId, params) =>
      managerFetch({ method: 'GET', path: withQuery(`/v1/visits/${visitId}/tracking/trace`, params) }),

    // --- Media (signed, short-lived URLs — store media IDs, never URLs) ---
    createUpload: (payload) =>
      managerFetch({ method: 'POST', path: '/v1/media/uploads', body: payload }),
    completeUpload: (mediaId) =>
      managerFetch({ method: 'POST', path: `/v1/media/uploads/${mediaId}/complete` }),
    getMedia: (mediaId) =>
      managerFetch({ method: 'GET', path: `/v1/media/${mediaId}` }),
  };
}

// Mock API — the whole app must stay drivable with VITE_MANAGER_MOCK=true and
// no backend. Shapes mirror the OpenAPI spec ({ data } envelopes; list
// responses carry { data, meta } with keyset meta.cursor). Extend per-flow as
// screens get built; keep shapes honest to the spec rather than convenient.
export function createMockManagerApi() {
  const org = { id: 'org_001', name: 'Acme Corp HQ' };

  const visitors = [
    {
      id: 'visitor_001',
      organization_id: org.id,
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+15555550123',
      status: 'active',
      type: 'guest',
      company: 'Northwind Traders',
      photo_media_id: 'media_photo_001',
      version: 4,
      created_at: '2026-07-01T17:20:00Z',
      updated_at: '2026-07-09T22:41:00Z',
    },
    {
      id: 'visitor_002',
      organization_id: org.id,
      first_name: 'Jordan',
      last_name: 'Smith',
      email: 'jordan@example.com',
      phone: '+15555550188',
      status: 'active',
      type: 'contractor',
      company: 'Fabrikam',
      photo_media_id: null,
      version: 2,
      created_at: '2026-06-20T15:00:00Z',
      updated_at: '2026-07-08T18:12:00Z',
    },
  ];

  // Unread is derived from a null read_at (sentinel-ui notificationsProvider
  // convention), not a boolean flag.
  const notifications = [
    {
      id: 'ntf_001',
      type: 'visitor_checked_in',
      title: 'Jane Doe checked in',
      severity: 'info',
      created_at: '2026-07-10T16:05:00Z',
      read_at: null,
    },
    {
      id: 'ntf_002',
      type: 'checkin_failed',
      title: 'Check-in failed at Main Lobby',
      severity: 'warning',
      created_at: '2026-07-10T15:47:00Z',
      read_at: '2026-07-10T15:50:00Z',
    },
  ];

  // Visit shape mirrors the live contract fields the visit/badge flows key
  // off (visitHelpers.js / useVisitFlow.js in sentinel-ui): status lifecycle
  // pending|checking_in|active|checking_out|completed|failed|cancelled,
  // checkin_status, and the badge pipeline media/error fields.
  const visits = [
    {
      id: 'visit_001',
      visitor_id: 'visitor_001',
      org_id: org.id,
      status: 'active',
      checkin_status: 'confirmed',
      badge_raw_media_id: 'media_badge_raw_001',
      badge_encoded_media_id: 'media_badge_enc_001',
      badge_render_error: null,
      badge_encode_error: null,
      version: 3,
      scheduled_start: '2026-07-10T15:30:00Z',
      scheduled_end: null,
      created_at: '2026-07-10T15:28:00Z',
      updated_at: '2026-07-10T16:05:00Z',
    },
  ];

  return {
    request: async () => ({ data: {} }),

    whoami: async () => ({
      data: {
        user_id: 'user_mock_001',
        email: 'staff@example.com',
        principal: 'user',
        org_ids: [org.id],
        membership_org_ids: [org.id],
        assignments: [{ role: 'front_desk', org_id: org.id }],
        scope_identity: { org_id: org.id },
        scope_label: org.name,
        scope_class: 'organization',
        effective_permissions: {},
        membership_version: 'v1-mock',
        evaluated_at: new Date().toISOString(),
      },
    }),
    listAuthScopes: async () => ({ data: {} }),
    getScopeTree: async () => ({
      data: { organization: { ...org, divisions: [] } },
    }),

    listVisitors: async () => ({
      data: visitors,
      meta: { sort: '-updated_at,id', limit: 50 },
    }),
    getVisitor: async (visitorId) => ({
      data: visitors.find((v) => v.id === visitorId) || { ...visitors[0], id: visitorId },
    }),
    createVisitor: async (payload) => ({
      data: { id: `visitor_${crypto.randomUUID()}`, version: 1, ...payload },
    }),
    updateVisitor: async (visitorId, payload) => ({
      data: { id: visitorId, ...payload },
    }),
    uploadVisitorPhoto: async () => ({ data: { status: 'indexed' } }),
    faceReindexVisitor: async () => ({ data: { status: 'queued' } }),
    bulkImportVisitors: async () => ({ data: { rows: [] } }),

    checkinPreflight: async () => ({ data: { ok: true } }),
    checkin: async (visitorId) => ({
      data: {
        ...visits[0],
        id: `visit_${crypto.randomUUID()}`,
        visitor_id: visitorId,
        status: 'checking_in',
        checkin_status: 'pending',
        badge_raw_media_id: null,
        badge_encoded_media_id: null,
      },
    }),
    listScheduledCheckins: async () => ({ data: [], meta: { limit: 50 } }),

    listVisits: async () => ({ data: visits, meta: { sort: '-created_at,id', limit: 50 } }),
    getVisit: async (visitId) => ({
      data: { ...visits[0], id: visitId },
    }),
    createVisit: async (payload) => ({
      data: {
        ...visits[0],
        id: `visit_${crypto.randomUUID()}`,
        status: 'pending',
        checkin_status: null,
        badge_raw_media_id: null,
        badge_encoded_media_id: null,
        ...payload,
      },
    }),
    updateVisit: async (visitId, payload) => ({ data: { id: visitId, ...payload } }),
    confirmVisit: async (visitId) => ({ data: { ...visits[0], id: visitId, status: 'active' } }),
    checkoutVisit: async (visitId) => ({ data: { ...visits[0], id: visitId, status: 'checking_out' } }),
    completeVisit: async (visitId) => ({ data: { ...visits[0], id: visitId, status: 'completed' } }),
    cancelVisit: async (visitId) => ({ data: { ...visits[0], id: visitId, status: 'cancelled' } }),
    assignBadge: async (visitId) => ({ data: { id: visitId } }),
    rerenderBadge: async (visitId) => ({ data: { id: visitId, badge_status: 'rendering' } }),
    listVisitEvents: async () => ({ data: [], meta: { limit: 50 } }),

    listStations: async () => ({
      data: [
        { id: 'stn_001', name: 'Front Desk', status: 'active' },
        { id: 'stn_002', name: 'Rear Lobby', status: 'active' },
      ],
      meta: { limit: 50 },
    }),
    listDivisions: async () => ({ data: [{ id: 'div_001', name: 'Operations' }], meta: { limit: 50 } }),
    listLocations: async () => ({ data: [{ id: 'loc_001', name: 'Reno' }], meta: { limit: 50 } }),
    listBuildings: async () => ({ data: [{ id: 'bld_001', name: 'Main Lobby' }], meta: { limit: 50 } }),

    listHostContacts: async () => ({ data: [], meta: { limit: 50 } }),
    suggestHostContacts: async () => ({ data: [] }),
    getHostContact: async (orgId, hostContactId) => ({ data: { id: hostContactId } }),

    listNotifications: async () => ({ data: notifications, meta: { limit: 50 } }),
    markNotificationRead: async (notificationId) => ({ data: { id: notificationId, read: true } }),
    markNotificationsRead: async () => ({ data: { updated: notifications.length } }),
    createNotificationStreamTicket: async () => ({ data: { ticket: `tkt_${crypto.randomUUID()}` } }),

    getMetrics: async () => ({ data: { active_visits: 1, visitors_today: 4 } }),
    getCheckinOpsMetrics: async () => ({ data: {} }),
    getMetricsTimeseries: async () => ({ data: [] }),
    getLiveMetricsTimeseries: async () => ({ data: [] }),

    getTrackingMap: async () => ({ data: { floors: [], positions: [] } }),
    getVisitTracking: async () => ({ data: { points: [] } }),
    getVisitTrackingTrace: async () => ({ data: { points: [] } }),

    createUpload: async () => ({
      data: {
        media_id: `media_${crypto.randomUUID()}`,
        upload_url: 'https://example.invalid/upload',
        headers: {},
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    }),
    completeUpload: async () => ({ data: { status: 'complete' } }),
    getMedia: async (mediaId) => ({ data: { media_id: mediaId, url: 'https://placehold.co/160x160' } }),
  };
}
