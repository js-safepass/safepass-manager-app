import { buildDpopProof } from './dpop.js';

export class KioskApiError extends Error {
  constructor(message, { code, status, details, retryAfter } = {}) {
    super(message);
    this.name = 'KioskApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    // Phase 7: optional server-suggested retry delay (seconds). Surfaced
    // from the Retry-After response header so retry.js can honor it even
    // if the response body omits retry_after_seconds.
    this.retryAfter = retryAfter;
  }
}

const mutatingMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

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
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export function createKioskApi({
  baseUrl,
  getKioskJwt,
  getSessionToken,
  getDpopKeys,
  onSessionRefreshRequired,
}) {
  const root = normalizeBaseUrl(baseUrl);

  async function kioskFetch(req, options = {}) {
    const { method, path, body, idempotencyKey } = req;
    if (!path.startsWith('/v1/kiosk/')) {
      throw new Error(`Kiosk path required: ${path}`);
    }

    // Refresh-interceptor budget: at most one auto-refresh-and-retry per
    // outer call. Prevents a refresh-then-fail-with-the-same-code path
    // from looping; a second KIOSK_SESSION_REFRESH_REQUIRED (or any other
    // failure) on retry propagates normally.
    let refreshAttempted = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = `${root}${path}`;
      const headers = new Headers();
      headers.set('X-Request-Id', crypto.randomUUID());

      if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
      }

      const useKioskJwt = options.useKioskJwt === true;
      const bearer = useKioskJwt ? getKioskJwt?.() : getSessionToken?.();
      if (!bearer) {
        // Phase 8: the Cognito JWT is purged at lock time, so any post-lock
        // call that still requests `useKioskJwt: true` is a logic bug — the
        // operator would need to re-Cognito-sign-in to satisfy it, defeating
        // the unattended-longevity goal. Throw with a distinct message so the
        // origin is obvious in a crash report.
        if (useKioskJwt) {
          throw new KioskApiError('Kiosk JWT required but unavailable — this path is not supported after kiosk lock.', {
            code: 'KIOSK_JWT_UNAVAILABLE_POST_LOCK',
            status: 0,
          });
        }
        throw new Error('Kiosk session required');
      }
      headers.set('Authorization', `Bearer ${bearer}`);

      if (idempotencyKey) {
        headers.set('Idempotency-Key', idempotencyKey);
      }

      if (!useKioskJwt) {
        const dpop = getDpopKeys?.();
        if (!dpop?.keyPair || !dpop?.publicJwk) {
          throw new Error('DPoP keys missing');
        }
        const parsedUrl = new URL(url, window.location.origin);
        const htu = `${parsedUrl.pathname}${parsedUrl.search}`;
        const proof = await buildDpopProof({
          method,
          htu,
          bearer,
          keyPair: dpop.keyPair,
          publicJwk: dpop.publicJwk,
        });
        headers.set('DPoP', proof);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const payload = await readPayload(response);

      if (response.ok) return payload;

      const { code, message } = parseErrorPayload(payload);

      // PR1: server is signalling "your access token is past ExpiresAt
      // but still within the refresh grace window — refresh and try
      // again." Auto-recover by awaiting an external refresh (the
      // context-owned refreshSession, which dedups concurrent triggers)
      // then replaying the original request with the rotated bearer.
      // Skipped for the /session/refresh call itself
      // (options.skipRefreshInterceptor) to prevent infinite recursion
      // if refresh ever returns this code.
      if (
        response.status === 401 &&
        code === 'KIOSK_SESSION_REFRESH_REQUIRED' &&
        !options.skipRefreshInterceptor &&
        !refreshAttempted &&
        onSessionRefreshRequired
      ) {
        refreshAttempted = true;
        try {
          await onSessionRefreshRequired();
        } catch {
          // Refresh failed (permanent error or backoff exhausted). Fall
          // through and surface the original 401 — the caller's reauth
          // handling kicks in identically to today.
        }
        // Retry the original request with the (hopefully) rotated bearer.
        // If refresh failed, getSessionToken() returns the same stale
        // token and the next attempt will fail with the same code; the
        // refreshAttempted guard makes the second pass propagate.
        continue;
      }

      // Pull the Retry-After header onto the error object so retry.js
      // can honor it even if the response body omits retry_after_seconds.
      // PR1's 429 KIOSK_REFRESH_TOO_SOON sets both; the body is canonical,
      // the header is the fallback (Phase 7).
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      throw new KioskApiError(message || `Request failed with ${response.status}`, {
        code,
        status: response.status,
        details: payload,
        retryAfter: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds
          : undefined,
      });
    }
  }

  function idempotencyKey() {
    return crypto.randomUUID();
  }

  return {
    request: kioskFetch,
    startSession: (payload) =>
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/start', body: payload }, { useKioskJwt: true }),
    listBootstrapOrgs: () =>
      kioskFetch({ method: 'GET', path: '/v1/kiosk/bootstrap/orgs' }, { useKioskJwt: true }),
    listBootstrapDivisions: (orgId) =>
      kioskFetch({ method: 'GET', path: `/v1/kiosk/bootstrap/orgs/${orgId}/divisions` }, { useKioskJwt: true }),
    listBootstrapLocations: (divisionId) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/bootstrap/divisions/${divisionId}/locations` },
        { useKioskJwt: true },
      ),
    listBootstrapBuildings: (locationId) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/bootstrap/locations/${locationId}/buildings` },
        { useKioskJwt: true },
      ),
    listBootstrapStations: (buildingId) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/bootstrap/buildings/${buildingId}/stations` },
        { useKioskJwt: true },
      ),
    refreshSession: () =>
      // skipRefreshInterceptor: a refresh call returning
      // KIOSK_SESSION_REFRESH_REQUIRED would otherwise recurse — instead,
      // surface the error normally so refreshSession's own backoff /
      // reauth logic handles it.
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/refresh' }, { skipRefreshInterceptor: true }),
    endSession: () =>
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/end' }),
    lockSession: () =>
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/lock' }),
    unlockSession: (payload) =>
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/unlock', body: payload }),
    setPasscode: (payload) =>
      kioskFetch({ method: 'POST', path: '/v1/kiosk/session/passcode', body: payload }),
    getSession: () =>
      kioskFetch({ method: 'GET', path: '/v1/kiosk/session/me' }),
    getContext: () =>
      kioskFetch({ method: 'GET', path: '/v1/kiosk/context' }),
    getCheckinDocs: () =>
      kioskFetch({ method: 'GET', path: '/v1/kiosk/checkin-docs' }),
    listOrgs: (options = {}) =>
      kioskFetch({ method: 'GET', path: '/v1/kiosk/orgs' }, { useKioskJwt: options.useKioskJwt }),
    listDivisions: (orgId, options = {}) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/orgs/${orgId}/divisions` },
        { useKioskJwt: options.useKioskJwt },
      ),
    listLocations: (divisionId, options = {}) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/divisions/${divisionId}/locations` },
        { useKioskJwt: options.useKioskJwt },
      ),
    listBuildings: (locationId, options = {}) =>
      kioskFetch(
        { method: 'GET', path: `/v1/kiosk/locations/${locationId}/buildings` },
        { useKioskJwt: options.useKioskJwt },
      ),
    createUpload: (payload) =>
      kioskFetch({
        method: 'POST',
        path: '/v1/kiosk/media/uploads',
        body: payload,
      }),
    completeUpload: (mediaId) =>
      kioskFetch({
        method: 'POST',
        path: `/v1/kiosk/media/uploads/${mediaId}/complete`,
      }),
    identify: (payload) =>
      kioskFetch({
        method: 'POST',
        path: '/v1/kiosk/identify',
        body: payload,
      }),
    confirmCandidate: (payload) =>
      kioskFetch({
        method: 'POST',
        path: '/v1/kiosk/identify/confirm',
        body: payload,
      }),
    getCandidateDetails: (candidateId) =>
      kioskFetch({
        method: 'GET',
        path: `/v1/kiosk/identify/candidates/${candidateId}`,
      }),
    searchVisitors: (payload) =>
      kioskFetch({
        method: 'POST',
        path: '/v1/kiosk/visitors/search',
        body: payload,
      }),
    getScheduledVisits: (visitorId) =>
      kioskFetch({ method: 'GET', path: `/v1/kiosk/visitors/${visitorId}/scheduled` }),
    createVisitor: (payload) =>
      kioskFetch({
        method: 'POST',
        path: '/v1/kiosk/visitors',
        body: payload,
        idempotencyKey: idempotencyKey(),
      }),
    updateVisitor: (visitorId, payload) =>
      kioskFetch({
        method: 'PATCH',
        path: `/v1/kiosk/visitors/${visitorId}`,
        body: payload,
        idempotencyKey: idempotencyKey(),
      }),
    checkinPreflight: (visitorId) =>
      kioskFetch({
        method: 'POST',
        path: `/v1/kiosk/visitors/${visitorId}/checkin/preflight`,
        body: {},
        idempotencyKey: idempotencyKey(),
      }),
    checkin: (visitorId, payload) =>
      kioskFetch({
        method: 'POST',
        path: `/v1/kiosk/visitors/${visitorId}/checkin`,
        body: payload,
        idempotencyKey: idempotencyKey(),
      }),
    getVisit: (visitId) =>
      kioskFetch({ method: 'GET', path: `/v1/kiosk/visits/${visitId}` }),
  };
}

export function createMockKioskApi() {
  let session = null;
  let passcodeSet = false;

  const futureIso = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

  const requireSession = () => {
    if (!session) {
      throw new KioskApiError('Kiosk session required', {
        code: 'KIOSK_SESSION_REQUIRED',
        status: 401,
      });
    }
  };

  return {
    request: async () => ({ data: {} }),
    startSession: async (payload) => {
      session = {
        session_token: `ks_mock_${crypto.randomUUID()}`,
        session_id: crypto.randomUUID(),
        expires_at: futureIso(20),
        max_expires_at: futureIso(60),
        mode: 'setup',
        locked: false,
        passcode_set: passcodeSet,
        scope: {
          org_id: payload.org_id,
          location_id: payload.location_id,
          building_id: payload.building_id,
          station_id: payload.station_id,
        },
      };
      return { data: session };
    },
    refreshSession: async () => {
      requireSession();
      session = {
        ...session,
        session_token: `ks_mock_${crypto.randomUUID()}`,
        expires_at: futureIso(20),
      };
      return { data: session };
    },
    endSession: async () => {
      session = null;
      return { data: {} };
    },
    lockSession: async () => {
      requireSession();
      session = { ...session, mode: 'kiosk_locked', locked: true };
      return { data: session };
    },
    unlockSession: async () => {
      requireSession();
      session = {
        ...session,
        mode: 'setup',
        locked: false,
        session_token: `ks_mock_${crypto.randomUUID()}`,
      };
      return { data: session };
    },
    setPasscode: async () => {
      requireSession();
      passcodeSet = true;
      session = { ...session, passcode_set: true };
      return { data: { passcode_set: true } };
    },
    getSession: async () => {
      requireSession();
      return { data: session };
    },
    getContext: async () => ({
      data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
    }),
    getCheckinDocs: async () => ({
      data: {
        pack_id: `sha256:${crypto.randomUUID()}`,
        resolved_at: new Date().toISOString(),
        scope: session?.scope || null,
        docs: [
          {
            id: 'doc-terms',
            kind: 'terms',
            title: 'Terms of Entry',
            interaction_mode: 'required',
            order_id: 1,
            used_for_checkin: true,
            location_ids: [],
            version: 3,
            version_id: 'doc-terms-v3',
            effective_at: '2026-03-01T00:00:00Z',
            effective_until: null,
            body: 'Please follow all site safety guidelines and remain in marked visitor areas.',
          },
          {
            id: 'doc-privacy',
            kind: 'disclaimer',
            title: 'Data and Photo Collection Opt-In',
            interaction_mode: 'optional',
            order_id: 2,
            used_for_checkin: 'yes',
            location_ids: [],
            version: 1,
            version_id: 'doc-privacy-v1',
            effective_at: '2026-05-07T00:00:00Z',
            effective_until: null,
            body: 'By continuing, you consent to visitor data and photo collection per policy.',
          },
        ],
      },
    }),
    listBootstrapOrgs: async () => ({
      data: [
        { id: 'org_001', name: 'Acme Corp HQ', status: 'active', current: true },
      ],
    }),
    listBootstrapDivisions: async () => ({
      data: [
        { id: 'div_001', name: 'Operations', status: 'active' },
      ],
    }),
    listBootstrapLocations: async () => ({
      data: [
        { id: 'loc_001', name: 'Reno', status: 'active' },
      ],
    }),
    listBootstrapBuildings: async () => ({
      data: [
        { id: 'bld_001', name: 'Main Lobby', status: 'active' },
      ],
    }),
    listBootstrapStations: async () => ({
      data: [
        { id: 'stn_001', name: 'Front Desk', status: 'active' },
        { id: 'stn_002', name: 'Rear Lobby', status: 'active' },
      ],
    }),
    listOrgs: async () => {
      requireSession();
      return {
        data: [
          { id: 'org_001', name: 'Acme Corp HQ', status: 'active', current: true },
        ],
      };
    },
    listDivisions: async () => {
      requireSession();
      return {
        data: [
          { id: 'div_001', name: 'Operations', status: 'active' },
        ],
      };
    },
    listLocations: async () => {
      requireSession();
      return {
        data: [
          { id: 'loc_001', name: 'Reno', status: 'active' },
        ],
      };
    },
    listBuildings: async () => {
      requireSession();
      return {
        data: [
          { id: 'bld_001', name: 'Main Lobby', status: 'active' },
        ],
      };
    },
    createUpload: async () => ({ data: { id: `media_${crypto.randomUUID()}` } }),
    completeUpload: async () => ({ data: { status: 'complete' } }),
    identify: async () => ({
      data: {
        org_id: 'org_001',
        location_id: 'loc_001',
        building_id: 'bld_001',
        photo_media_id: `media_${crypto.randomUUID()}`,
        threshold: 90,
        resolved_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        image_validation: {
          face_count: 1,
          has_face: true,
          multiple_faces: false,
          quality_score: 0.86,
          quality_pass: true,
          brightness: 0.52,
          sharpness: 0.74,
        },
        candidates: [
          {
            candidate_id: `cand_${crypto.randomUUID()}`,
            display_name: 'Jane Doe',
            photo_url: 'https://placehold.co/120x120',
            confidence: 97.3,
            status: 'active',
            eligible_for_checkin: true,
            requires_review: false,
            rejected: false,
          },
          {
            candidate_id: `cand_${crypto.randomUUID()}`,
            display_name: 'Jamie Doe',
            photo_url: 'https://placehold.co/120x120',
            confidence: 92.1,
            status: 'active',
            eligible_for_checkin: true,
            requires_review: true,
            rejected: false,
          },
        ],
      },
    }),
    confirmCandidate: async () => ({
      data: {
        candidate: {
          confidence: 97.3,
          expires_at: Math.floor(Date.now() / 1000) + 600,
        },
        visitor: {
          id: `visitor_${crypto.randomUUID()}`,
          organization_id: 'org_001',
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@example.com',
          phone: '+15555550123',
          status: 'active',
          type: 'person',
          notes: '',
          employee_id: '',
          photo_media_id: `media_${crypto.randomUUID()}`,
          photo_url: 'https://placehold.co/160x160',
          version: 4,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date().toISOString(),
          meta: {},
          company: 'Acme Corp',
          company_address: '',
          company_logo_media_id: '',
          host_type: '',
          host_user_id: '',
          host_contact: null,
        },
      },
    }),
    getCandidateDetails: async () => ({
      data: {
        candidate: {
          confidence: 97.3,
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
        visitor: {
          id: `visitor_${crypto.randomUUID()}`,
          organization_id: 'org_001',
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@example.com',
          phone: '+15555550123',
          status: 'active',
          type: 'guest',
          employee_id: '',
          photo_media_id: `media_${crypto.randomUUID()}`,
          photo_url: 'https://placehold.co/160x160',
          company: 'Acme Corp',
          company_address: '',
          company_logo_media_id: '',
          host_type: 'contact',
          host_user_id: '',
          host_contact: {
            name: 'John Smith',
            first_name: 'John',
            last_name: 'Smith',
            email: 'john.smith@example.com',
            phone: '+15555550199',
            notify_via: 'email',
            notify_on_checkin: true,
          },
          notes: '',
          meta: {},
          version: 3,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    }),
    searchVisitors: async () => ({
      data: [
        {
          id: `visitor_${crypto.randomUUID()}`,
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@example.com',
          status: 'active',
          photo_url: 'https://placehold.co/120x120',
        },
        {
          id: `visitor_${crypto.randomUUID()}`,
          first_name: 'Jordan',
          last_name: 'Smith',
          email: 'jordan@example.com',
          status: 'active',
          photo_url: 'https://placehold.co/120x120',
        },
      ],
    }),
    getScheduledVisits: async () => ({ data: { results: [] } }),
    createVisitor: async (payload) => ({
      data: { id: `visitor_${crypto.randomUUID()}`, ...payload },
    }),
    updateVisitor: async (visitorId, payload) => ({
      data: { id: visitorId, ...payload },
    }),
    checkinPreflight: async () => ({ data: { ok: true } }),
    checkin: async (visitorId, payload) => ({
      data: { id: `visit_${crypto.randomUUID()}`, visitor_id: visitorId, ...payload },
    }),
    getVisit: async (visitId) => ({ data: { id: visitId, status: 'checked_in' } }),
  };
}

export function isMutating(method) {
  return mutatingMethods.has(method.toUpperCase());
}
