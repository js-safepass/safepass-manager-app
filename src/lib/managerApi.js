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
  // May be async: the auth layer refreshes a stale token before returning it
  // (AuthContext.getFreshAccessToken).
  getAccessToken,
  // Called once per 401 response before the error throws — the app signs the
  // user out here so every screen inherits re-auth behavior from the seam
  // instead of hand-rolling it.
  onUnauthorized,
  // Deferred DPoP seam (decision #5 in docs/build-plan.md): when the backend
  // grows a manager-surface sender-constrained session, wire a proof builder
  // here — `attachProof({ method, url, bearer })` returning the DPoP header
  // value — and every call site is covered. Not used today.
  attachProof,
}) {
  const root = normalizeBaseUrl(baseUrl);

  async function managerFetch(req, options = {}) {
    const { method, path } = req;
    if (!path.startsWith('/v1/')) {
      throw new Error(`API path must start with /v1/: ${path}`);
    }
    // Resolve the Idempotency-Key ONCE per logical request, outside the
    // attempt loop: the one-shot 401 retry below must replay with the SAME
    // key or the backend would treat it as a second, distinct mutation.
    const idempotencyKey = isMutating(method)
      ? (req.idempotencyKey || crypto.randomUUID())
      : null;
    return attempt(req, options, idempotencyKey, false);
  }

  // `retried` guards the one-shot 401 refresh-then-retry (recursion, not a
  // loop): a 401 forces a token refresh and re-attempts once; a second 401
  // hands off to onUnauthorized.
  async function attempt(req, options, idempotencyKey, retried) {
    const { method, path, body } = req;
    const url = `${root}${path}`;
    const headers = new Headers();
    const requestId = crypto.randomUUID();
    headers.set('X-Request-Id', requestId);

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    // getAccessToken may be async (a stale token silently refreshes inside
    // it). Refresh failure is non-terminal there — it resolves to the best
    // token held — so an accessor THROW here is an unexpected fault (a
    // provider bug, or literally no session). Surface the app's auth error
    // but keep the real cause for flattenErrorForLog.
    let bearer;
    try {
      bearer = await getAccessToken?.();
    } catch (accessorError) {
      throw new ManagerApiError('Sign-in required', {
        code: 'UNAUTHORIZED',
        status: 401,
        details: { cause: accessorError },
      });
    }
    if (!bearer) {
      // In-memory token is gone (page refresh, expiry) — callers route this
      // to re-auth via getUserFacingError / the auth context.
      throw new ManagerApiError('Sign-in required', {
        code: 'UNAUTHORIZED',
        status: 401,
      });
    }
    headers.set('Authorization', `Bearer ${bearer}`);

    // Mutations always carry an Idempotency-Key (resolved once in
    // managerFetch so a 401 retry replays the same key).
    if (idempotencyKey) {
      headers.set('Idempotency-Key', idempotencyKey);
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

    // A 401 can straddle expiry (clock skew) or hit a token the silent
    // refresh hadn't rotated yet. Before treating it as terminal, force ONE
    // refresh and retry if that actually yields a different token — mirrors
    // sentinel-ui's fetchWithAuth. If the token doesn't change (e.g. the
    // backend is rejecting a valid token), fall through to onUnauthorized.
    if (response.status === 401 && !retried && getAccessToken) {
      let refreshed = null;
      try {
        refreshed = await getAccessToken({ forceRefresh: true });
      } catch {
        refreshed = null;
      }
      if (refreshed && refreshed !== bearer) {
        return attempt(req, options, idempotencyKey, true);
      }
    }

    const { code, message } = parseErrorPayload(payload);

    // Notify the auth owner so it can decide (threshold-gated) whether the
    // session is dead. Pollers must stop on 401 (brief §5).
    if (response.status === 401) {
      try {
        onUnauthorized?.();
      } catch {
        // The sign-out hook must never mask the original error.
      }
    }

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
    // No updateVisit: PATCH /v1/visits/{id} is not a registered backend
    // route and is not on this app's policy — visit changes happen through
    // the lifecycle actions below (backend decision "remove, don't build",
    // 2026-07-12).
    // confirmVisit confirmed allowed under the manager app policy
    // (backend app-client authorization gate, verified 2026-07-12).
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

// ---------------------------------------------------------------------------
// Mock API — the whole app must stay drivable with VITE_MANAGER_MOCK=true and
// no backend. Shapes mirror the OpenAPI spec ({ data } envelopes; lists carry
// { data, meta } with opaque keyset meta.cursor, absent on the last page;
// expand hydrates a top-level includes map). Stateful on purpose: check-in
// simulates the async badge pipeline, visit transitions enforce the status
// lifecycle, notifications mutate — so flows behave like the live backend.
// ---------------------------------------------------------------------------
export function createMockManagerApi() {
  const org = { id: 'org_001', name: 'Acme Corp HQ' };
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const HOUR = 3600_000;
  const DAY = 24 * HOUR;

  const FIRST = ['Jane', 'Jordan', 'Maria', 'Wei', 'Aisha', 'Carlos', 'Emma', 'Noah', 'Priya', 'Liam', 'Sofia', 'Ethan', 'Chloe', 'Marcus', 'Yuki', 'Omar', 'Grace', 'Diego', 'Nina', 'Sam'];
  const LAST = ['Doe', 'Smith', 'Garcia', 'Chen', 'Khan', 'Reyes', 'Miller', 'Brown', 'Patel', 'Wilson', 'Rossi', 'Clark', 'Dubois', 'Webb', 'Tanaka', 'Hassan', 'Lee', 'Vargas', 'Novak', 'Turner'];
  const COMPANY = ['Northwind Traders', 'Fabrikam', 'Contoso', 'Globex', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises'];
  const TYPE = ['guest', 'contractor', 'vendor'];
  const STATUS = ['active', 'active', 'active', 'active', 'pending_review', 'archived'];

  const visitors = Array.from({ length: 34 }, (_, i) => ({
    id: `visitor_${String(i + 1).padStart(3, '0')}`,
    organization_id: org.id,
    first_name: FIRST[i % FIRST.length],
    last_name: LAST[(i * 7) % LAST.length],
    email: `${FIRST[i % FIRST.length]}.${LAST[(i * 7) % LAST.length]}@example.com`.toLowerCase(),
    phone: `+1555555${String(100 + i)}`,
    status: STATUS[i % STATUS.length],
    type: TYPE[i % TYPE.length],
    company: COMPANY[(i * 3) % COMPANY.length],
    notes: '',
    photo_media_id: i % 3 === 0 ? `media_photo_${i}` : null,
    version: 1 + (i % 5),
    created_at: iso((40 - i) * DAY),
    updated_at: iso((34 - i) * 6 * HOUR),
  }));

  let visitSeq = 100;
  const visits = [
    // A couple of completed past visits, one active now, one pending today.
    { id: 'visit_001', visitor_id: 'visitor_003', org_id: org.id, status: 'completed', checkin_status: 'confirmed', badge_raw_media_id: 'media_braw_1', badge_encoded_media_id: 'media_benc_1', badge_render_error: null, badge_encode_error: null, version: 4, scheduled_start: iso(3 * DAY), scheduled_end: iso(3 * DAY - 4 * HOUR), created_at: iso(3 * DAY), updated_at: iso(3 * DAY - 4 * HOUR), _pipelineDone: true },
    { id: 'visit_002', visitor_id: 'visitor_007', org_id: org.id, status: 'completed', checkin_status: 'confirmed', badge_raw_media_id: 'media_braw_2', badge_encoded_media_id: 'media_benc_2', badge_render_error: null, badge_encode_error: null, version: 4, scheduled_start: iso(1 * DAY), scheduled_end: iso(1 * DAY - 2 * HOUR), created_at: iso(1 * DAY), updated_at: iso(1 * DAY - 2 * HOUR), _pipelineDone: true },
    { id: 'visit_003', visitor_id: 'visitor_001', org_id: org.id, status: 'active', checkin_status: 'confirmed', badge_raw_media_id: 'media_braw_3', badge_encoded_media_id: 'media_benc_3', badge_render_error: null, badge_encode_error: null, version: 3, scheduled_start: iso(2 * HOUR), scheduled_end: null, created_at: iso(2 * HOUR), updated_at: iso(1 * HOUR), _pipelineDone: true },
    { id: 'visit_004', visitor_id: 'visitor_005', org_id: org.id, status: 'pending', checkin_status: null, badge_raw_media_id: null, badge_encoded_media_id: null, badge_render_error: null, badge_encode_error: null, version: 1, scheduled_start: new Date(now + 3 * HOUR).toISOString(), scheduled_end: new Date(now + 6 * HOUR).toISOString(), created_at: iso(6 * HOUR), updated_at: iso(6 * HOUR) },
  ];

  const notifications = [
    { id: 'ntf_001', type: 'visitor_checked_in', severity: 'info', title: 'Jane Doe checked in at Main Lobby', created_at: iso(0.5 * HOUR), read_at: null },
    { id: 'ntf_002', type: 'geofence_breach', severity: 'warning', title: 'Geofence alert: visitor left permitted zone (Floor 2)', created_at: iso(1.2 * HOUR), read_at: null },
    { id: 'ntf_003', type: 'checkin_failed', severity: 'warning', title: 'Check-in failed at Main Lobby kiosk — no badges available', created_at: iso(3 * HOUR), read_at: null },
    { id: 'ntf_004', type: 'visit_completed', severity: 'info', title: 'Wei Chen checked out', created_at: iso(5 * HOUR), read_at: iso(4 * HOUR) },
    { id: 'ntf_005', type: 'review_required', severity: 'warning', title: 'New visitor requires review: Omar Hassan', created_at: iso(8 * HOUR), read_at: iso(7 * HOUR) },
    { id: 'ntf_006', type: 'device_offline', severity: 'danger', title: 'Badge encoder BE-02 went offline', created_at: iso(26 * HOUR), read_at: iso(20 * HOUR) },
  ];

  // Simulated async badge pipeline: a fresh check-in confirms after ~4s and
  // finishes badge render/encode after ~8s, observed lazily on read — the
  // same eventual states the UI polls for against the live backend.
  const promote = (v) => {
    if (v._pipelineDone || !v._checkinStartedAt) return v;
    const age = Date.now() - v._checkinStartedAt;
    if (age > 4000 && v.status === 'checking_in') {
      v.status = 'active';
      v.checkin_status = 'confirmed';
      v.updated_at = new Date().toISOString();
    }
    if (age > 8000 && v.status === 'active' && !v.badge_encoded_media_id) {
      v.badge_raw_media_id = `media_braw_${v.id}`;
      v.badge_encoded_media_id = `media_benc_${v.id}`;
      v._pipelineDone = true;
      v.updated_at = new Date().toISOString();
    }
    return v;
  };

  const notFound = (code) => new ManagerApiError('Not found', { code, status: 404 });
  const conflict = (message, code) => new ManagerApiError(message, { code, status: 409 });

  // Keyset-pagination façade over the in-memory list: cursor is an opaque
  // base64 offset, present only when another page exists (per the guide,
  // absent cursor — not short pages — is the end-of-list signal).
  const paginate = (rows, { cursor, limit } = {}) => {
    const pageSize = Math.min(Number(limit) || 50, 200);
    const offset = cursor ? Number(atob(String(cursor))) || 0 : 0;
    const page = rows.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const meta = { sort: '-updated_at,id', limit: pageSize };
    if (nextOffset < rows.length) meta.cursor = btoa(String(nextOffset));
    return { data: page, meta };
  };

  const stripInternal = (v) => {
    const copy = { ...v };
    delete copy._checkinStartedAt;
    delete copy._pipelineDone;
    return copy;
  };

  const csv = (value) => String(value).toLowerCase().split(',').map((s) => s.trim());

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
    getScopeTree: async () => ({ data: { organization: { ...org, divisions: [] } } }),

    listVisitors: async (params = {}) => {
      let rows = [...visitors];
      if (params.name) {
        const q = String(params.name).toLowerCase();
        rows = rows.filter((v) =>
          `${v.first_name} ${v.last_name}`.toLowerCase().includes(q) || v.email.includes(q));
      }
      if (params.status) rows = rows.filter((v) => csv(params.status).includes(v.status));
      if (params.type) rows = rows.filter((v) => csv(params.type).includes(v.type));
      if (params.company) {
        const q = String(params.company).toLowerCase();
        rows = params.company_match === 'like'
          ? rows.filter((v) => v.company.toLowerCase().includes(q))
          : rows.filter((v) => csv(params.company).includes(v.company.toLowerCase()));
      }
      rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      return paginate(rows, params);
    },
    getVisitor: async (visitorId) => {
      const found = visitors.find((v) => v.id === visitorId);
      if (!found) throw notFound('VISITOR_NOT_FOUND');
      return { data: found };
    },
    createVisitor: async (payload) => {
      const created = {
        id: `visitor_${crypto.randomUUID().slice(0, 8)}`,
        organization_id: org.id,
        status: 'active',
        type: 'guest',
        notes: '',
        photo_media_id: null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      visitors.unshift(created);
      return { data: created };
    },
    updateVisitor: async (visitorId, payload) => {
      const found = visitors.find((v) => v.id === visitorId);
      if (!found) throw notFound('VISITOR_NOT_FOUND');
      Object.assign(found, payload, {
        version: found.version + 1,
        updated_at: new Date().toISOString(),
      });
      return { data: found };
    },
    uploadVisitorPhoto: async () => ({ data: { status: 'indexed' } }),
    faceReindexVisitor: async () => ({ data: { status: 'queued' } }),
    bulkImportVisitors: async () => ({ data: { rows: [] } }),

    checkinPreflight: async (visitorId) => {
      const visitor = visitors.find((v) => v.id === visitorId);
      if (!visitor) throw notFound('VISITOR_NOT_FOUND');
      const open = visits.some((v) => v.visitor_id === visitorId && ['checking_in', 'active', 'checking_out'].includes(promote(v).status));
      return { data: { ok: !open, reason: open ? 'VISITOR_ALREADY_CHECKED_IN' : null } };
    },
    checkin: async (visitorId) => {
      const visitor = visitors.find((v) => v.id === visitorId);
      if (!visitor) throw notFound('VISITOR_NOT_FOUND');
      if (visitor.status === 'pending_review') {
        throw new ManagerApiError('Visitor requires review before check-in.', { code: 'REVIEW_REQUIRED', status: 428 });
      }
      if (visits.some((v) => v.visitor_id === visitorId && ['checking_in', 'active', 'checking_out'].includes(promote(v).status))) {
        throw conflict('Visitor is already checked in.', 'VISITOR_ALREADY_CHECKED_IN');
      }
      const visit = {
        id: `visit_${visitSeq++}`,
        visitor_id: visitorId,
        org_id: org.id,
        status: 'checking_in',
        checkin_status: 'pending',
        badge_raw_media_id: null,
        badge_encoded_media_id: null,
        badge_render_error: null,
        badge_encode_error: null,
        version: 1,
        scheduled_start: new Date().toISOString(),
        scheduled_end: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _checkinStartedAt: Date.now(),
      };
      visits.unshift(visit);
      return { data: stripInternal(visit) };
    },
    listScheduledCheckins: async () => ({ data: [], meta: { limit: 50 } }),

    listVisits: async (params = {}) => {
      let rows = visits.map(promote);
      if (params.visitor_id) rows = rows.filter((v) => v.visitor_id === params.visitor_id);
      if (params.status) rows = rows.filter((v) => csv(params.status).includes(v.status));
      rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const page = paginate(rows, params);
      page.data = page.data.map(stripInternal);
      page.meta.sort = '-created_at,id';
      const wantVisitor = String(params.expand || '').includes('visitor');
      if (wantVisitor) {
        page.includes = {
          visitors: Object.fromEntries(
            page.data.map((v) => [v.visitor_id, visitors.find((x) => x.id === v.visitor_id)]).filter(([, x]) => x),
          ),
        };
      }
      return page;
    },
    getVisit: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      return { data: stripInternal(promote(found)) };
    },
    createVisit: async (payload) => {
      const visit = {
        id: `visit_${visitSeq++}`,
        org_id: org.id,
        status: 'pending',
        checkin_status: null,
        badge_raw_media_id: null,
        badge_encoded_media_id: null,
        badge_render_error: null,
        badge_encode_error: null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      visits.unshift(visit);
      return { data: visit };
    },
    confirmVisit: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      if (found.status !== 'pending') throw conflict('Only pending visits can be confirmed.', 'INVALID_STATUS_TRANSITION');
      Object.assign(found, { status: 'active', checkin_status: 'confirmed', updated_at: new Date().toISOString() });
      return { data: stripInternal(found) };
    },
    checkoutVisit: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      promote(found);
      if (!['active', 'checking_out'].includes(found.status)) {
        throw conflict('Visit is not eligible for checkout.', 'INVALID_STATUS_TRANSITION');
      }
      Object.assign(found, { status: 'completed', updated_at: new Date().toISOString() });
      return { data: stripInternal(found) };
    },
    completeVisit: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      Object.assign(found, { status: 'completed', updated_at: new Date().toISOString() });
      return { data: stripInternal(found) };
    },
    cancelVisit: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      promote(found);
      if (found.status !== 'pending') {
        throw conflict('Only pending visits can be cancelled.', 'INVALID_STATUS_TRANSITION');
      }
      Object.assign(found, { status: 'cancelled', updated_at: new Date().toISOString() });
      return { data: stripInternal(found) };
    },
    assignBadge: async (visitId) => ({ data: { id: visitId } }),
    rerenderBadge: async (visitId) => {
      const found = visits.find((v) => v.id === visitId);
      if (!found) throw notFound('NOT_FOUND');
      Object.assign(found, {
        badge_render_error: null,
        badge_encode_error: null,
        badge_raw_media_id: null,
        badge_encoded_media_id: null,
        _pipelineDone: false,
        _checkinStartedAt: Date.now(),
        updated_at: new Date().toISOString(),
      });
      return { data: stripInternal(found) };
    },
    listVisitEvents: async () => ({ data: [], meta: { limit: 50 } }),

    listStations: async () => ({
      data: [
        { id: 'stn_001', name: 'Front Desk', status: 'active' },
        { id: 'stn_002', name: 'Rear Lobby', status: 'active' },
      ],
      meta: { limit: 50 },
    }),
    // Scope hierarchy with real parent-key linkage (mirrors the mapping
    // app's mock seed): one division + one location (both AUTO-SELECT in the
    // scope drill) -> two buildings (a real choice). Exercises the
    // auto-select-single-above-building behavior end to end in mock mode.
    listDivisions: async (orgId, params) => paginate([
      { id: 'div_ops', organization_id: org.id, parent_division_id: null, name: 'Operations', status: 'active', version: 1 },
    ], params),
    listLocations: async (orgId, params) => paginate([
      { id: 'loc_reno', organization_id: org.id, division_id: 'div_ops', name: 'Reno Campus', status: 'active', timezone: 'America/Los_Angeles', version: 1 },
    ], params),
    listBuildings: async (orgId, params) => paginate([
      { id: 'bld_hq', organization_id: org.id, division_id: 'div_ops', location_id: 'loc_reno', name: 'Headquarters', status: 'active', timezone: 'America/Los_Angeles', version: 1 },
      { id: 'bld_annex', organization_id: org.id, division_id: 'div_ops', location_id: 'loc_reno', name: 'North Annex', status: 'active', timezone: 'America/Los_Angeles', version: 1 },
    ], params),

    listHostContacts: async () => ({ data: [], meta: { limit: 50 } }),
    suggestHostContacts: async () => ({ data: [] }),
    getHostContact: async (orgId, hostContactId) => ({ data: { id: hostContactId } }),

    listNotifications: async (params = {}) => paginate(
      [...notifications].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      params,
    ),
    markNotificationRead: async (notificationId) => {
      const found = notifications.find((n) => n.id === notificationId);
      if (!found) throw notFound('NOT_FOUND');
      found.read_at = found.read_at || new Date().toISOString();
      return { data: found };
    },
    markNotificationsRead: async (payload = {}) => {
      const ids = payload.ids || notifications.map((n) => n.id);
      let updated = 0;
      for (const n of notifications) {
        if (ids.includes(n.id) && !n.read_at) {
          n.read_at = new Date().toISOString();
          updated += 1;
        }
      }
      return { data: { updated } };
    },
    createNotificationStreamTicket: async () => ({ data: { ticket: `tkt_${crypto.randomUUID()}` } }),

    // Metrics shapes are PROVISIONAL in the spec (decision #10) — the mock
    // exposes a simple preset map computed from live mock state.
    getMetrics: async () => {
      const live = visits.map(promote);
      return {
        data: {
          on_site_now: live.filter((v) => ['active', 'checking_out'].includes(v.status)).length,
          checking_in: live.filter((v) => v.status === 'checking_in').length,
          visits_today: live.filter((v) => Date.now() - new Date(v.created_at).getTime() < DAY).length,
          visitors_total: visitors.filter((v) => v.status !== 'archived').length,
          pending_review: visitors.filter((v) => v.status === 'pending_review').length,
          unread_notifications: notifications.filter((n) => !n.read_at).length,
        },
      };
    },
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
