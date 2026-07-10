# SafePass Client Apps — Contractor Handoff Brief

Status: draft for external handoff. Prepared 2026-06-18; revised 2026-07-07.

## How to read this document

This is the **functional scope** for two client applications SafePass wants built
against its existing backend — enough for a contractor to understand what the apps
must do and price the work. It deliberately does **not** prescribe phases, milestones,
deliverables, timelines, or budget; those are yours to propose.

Endpoint-level detail — paths, request/response shapes, status codes — is in the
accompanying **OpenAPI 3.1 specification**, which covers exactly the endpoints these
two apps use.

---

## 1. Context

SafePass is a multi-tenant visitor-management and indoor-tracking platform. The
backend ("DataManager") is built and running: it exposes a single REST API under
`/v1` that already powers a kiosk check-in client and an internal web surface.

We are commissioning **two new operator-facing client applications** that consume
that same API. The backend, data model, authentication, and business rules are done
and are **not** part of this engagement — you are building clients on top of a
stable contract, not designing the system behind it.

The two apps are independent and can be quoted together or separately:

1. **Visitor Management App** — staff tooling for visitors, hosts, visits,
   check-in operations, badges, notifications, and operational dashboards.
2. **Mapping App** — operator tooling for floorplans, geofences, calibration,
   radio-map publishing, and live/historical visitor tracking.

---

## 2. Platform & technical baseline

These constraints apply to **both** apps and are non-negotiable because they follow
from the existing backend and delivery model.

- **Web-first application.** The hosted web app is the primary surface and the main
  update channel (ship without app-store release cycles). TypeScript is suggested;
  modern JavaScript is acceptable.
- **Web-first is a deployment strategy, not just a mobile convenience.** The same web
  build must be able to run hosted on SafePass cloud **or on-premises / customer-hosted
  infrastructure**, wrapped identically in a thin Capacitor WebView shell for installed
  iOS/Android tablets. Standardizing on a web core inside a WebView is a deliberate
  portability choice — a native-first build would fracture it — so the shell stays
  thin: native code is limited to platform capabilities the web layer cannot provide
  reliably (push notifications, haptics, camera capture), as thin Swift/Kotlin
  connectors. Calibration WiFi scanning is done by the badge hardware, not the operator
  device. This matches the existing kiosk pattern, where a WebView loads the
  SafePass-hosted app.
- **Single REST API.** All data comes from the DataManager `/v1` REST API. There is
  no second backend, no GraphQL, and no direct database or S3 access from the client.
- **Human auth via an external bridge.** Users authenticate through the branded
  `auth.safepass.com` Cognito bridge; the app receives a JWT and sends it as
  `Authorization: Bearer <jwt>`. The app does **not** own or build the login product.
- **Server is the source of truth for authorization.** After login the app hydrates
  state from `/v1/whoami` and `/v1/auth/scopes`; it must never infer permissions from
  local UI state. All tenant data is org-scoped and may be narrowed to division,
  location, building, or station — scope selectors must reflect the granted scope.
- **Per-app auth isolation.** Each app is its own auth *source*: it authenticates
  against its own Cognito **app client** (distinct `client_id`, PKCE) and receives a
  token confined server-side to that app's surface, so the Mapping app cannot call
  visitor endpoints and vice-versa. A later hardening phase adds sender-constrained
  (DPoP) sessions and action-scoped step-up re-auth — not part of this build; route
  all API calls through one centralized client layer per app so that retrofit lands
  in a single seam.

The cross-cutting API behaviors every screen must honor (idempotency keys, ETag
concurrency, RFC7807 errors, signed short-lived media URLs, tenant-safe 404s,
keyset pagination) are summarized in [§5](#5-cross-cutting-functional-requirements)
and specified per-endpoint in the accompanying OpenAPI spec.

---

## 3. What SafePass provides vs. what the contractor builds

**SafePass provides:**

- A running DataManager `/v1` REST API with a machine-readable OpenAPI contract,
  drift-gated in CI (route↔spec reconciliation).
- The `auth.safepass.com` Cognito authentication bridge (login is already built), and
  a dedicated Cognito **app client** per app, each with a server-side capability
  allowlist that confines it to that app's endpoints.
- A staging environment to develop and test against.
- **Reference** UX/brand material (existing kiosk and internal surfaces, branding,
  product context) to inform — not dictate — the design.

**Contractor builds:**

- Both client applications described in this brief, as web-first apps with thin
  Capacitor shells, delivered as the complete source repository — SafePass hosts,
  builds, and deploys them on its own infrastructure and accounts.
- **A centralized API/auth client layer** in each app (single request seam,
  reusable "verify again" re-auth step), so the deferred session-hardening phase
  (sender-bound DPoP sessions + action-scoped step-up re-auth) retrofits without
  touching call sites. The hardening itself is **not** in this build's scope.
- **UI/UX design.** *Assumption (open to negotiation):* the contractor delivers the
  UX/UI design — from wireframes through hi-fi — using SafePass reference material as
  a starting point. If you would prefer to implement against designs we supply, say
  so in your quote and price accordingly.

**Out of this engagement:** the backend/API, the hosted login product, the kiosk
client, and organization administration — all run by SafePass, not built here.

---

## 4. The two applications

### App 1 — Visitor Management App

**Purpose.** The operational hub for SafePass visitor operations. Staff **monitor**
what is happening — live notifications, who is on site and where, visit history, and
operational dashboards — and **manage** the underlying records (visitors, hosts,
scheduled visits). Check-in *is* supported, but it is a front-desk fallback: the kiosk
is the primary self-service check-in path, so check-in is a last-resort flow here, not
the app's centerpiece. Organization administration is handled separately by SafePass
and is not part of this app.

**Primary users / roles** (authorization is server-enforced; the UI adapts to the
caller's granted role and scope):

- `front_desk` — monitor arrivals and notifications, view visitors/visits and tracking,
  manage records, and check visitors in as a fallback to the kiosk. The primary user of
  this app.
- `location_admin` — bulk import, archive/delete where allowed, and set host
  notification preferences on the visitor/visit forms.
- `auditor` — read-oriented access.

**Screen / feature inventory** (functional surface to be sized):

| Area | What the user does | Key behaviors the UI must handle |
| --- | --- | --- |
| App shell & access | Sign in, pick org/scope, land on a workspace | Auth redirect; `whoami`/`scopes` bootstrap; org + sub-scope selector reflecting grants; global-admin posture; no-access state; optional OTP step; re-auth on 401/403 |
| Visitor directory | Browse, search, and filter visitors | Server filters (status, name, type, company, review-queue, geofence-breach); keyset pagination; signed photo/logo thumbnails |
| Visitor detail | View a single visitor's full record | Photos, identity/face state, history; graceful handling of archived/deleted/merged/retained visitors |
| Create / edit visitor | Add or update a visitor | Core + optional fields; host-contact fields inline; idempotent create; three create outcomes — **new created**, **existing reused**, **merge candidate emitted** — and reuse may return 200 not 201 |
| Visitor photos | Upload/enroll a visitor photo | Media upload for face indexing; clear face-index error messaging (no face / low quality / unsupported / failed). This app enrolls photos; it does not do face-matching |
| Bulk import | Import visitors from CSV | Submit CSV; surface per-row outcomes |
| Host contact usage | Pick/attach a host on a visitor or visit | Search/suggest hosts; create-or-attach via the visitor/visit form; set notify preferences |
| Visit scheduling | Create and schedule visits | Required org/location context (building required at check-in); scheduled windows incl. open-ended; status lifecycle (pending → checking_in → active → checking_out → completed, plus cancelled/failed/expired) |
| Front-desk check-in | Select a visitor and click Check In | One call (`POST /visitors/{id}/checkin`) matches/creates the visit + enqueues the badge pipeline (`202`, async via `checkin_status`); optional preflight drives the button state; a persistent station picker (`GET /orgs/{orgID}/stations`, read-only) scopes badge-pool selection; surface gate failures (review/background-check required → 428, already-checked-in / no-badges → 409, queue full → 429, unavailable → 503) |
| Badge pipeline | Watch and retry badge render/encode | Hide entirely when badge tracking is off; show render/encode progress and errors; retry/rerender when state and permissions allow; treat badge URLs as short-lived |
| Visit actions | Check out, complete, cancel a visit | Action endpoints with correct enabled/disabled state per status |
| Notifications | See operational alerts | Poll feed (~15s focused / ~60s unfocused), or use the SSE stream; mark read individually and in bulk; render unknown notification types safely |
| Operational dashboards | View live operational metrics | Preset dashboards (visitors / tracking / ops); render dates in the resolved scope timezone, not raw UTC; avoid N+1 fetches via expands/includes |
| Live tracking & monitoring | Watch on-site visitors move in real time; review a visit's path | Live map of active/checking-in/checking-out visitors on the calibrated floorplan (`GET /orgs/{org}/tracking/map`, poll ~15–30s); per-visit historical trace from visit detail (`/visits/{id}/tracking` + `/tracking/trace`); reads floorplan config read-only and does GPS↔pixel rendering client-side; handle "no data yet" |
| Visits from the kiosk | See visits that started at a self-service kiosk | Read-only visit state, surfaced alongside desk-created visits |

**Key user journeys** (monitoring and oversight first; check-in is a fallback):

1. **Monitor the floor.** Staff watch the live notification feed (arrivals, check-in
   failures, alerts) and a live map of who is on site and where, reacting as events
   happen. This is the app's day-to-day center of gravity.
2. **Review a visitor or visit.** Open a visitor or visit for its history, badge state,
   host, and tracked path — for oversight, questions, or incident review.
3. **Operational dashboards.** Watch live metrics — active visits, volumes, check-in
   and device health — across the granted scope.
4. **Manage records.** Create/edit visitors, attach hosts, schedule visits, and
   bulk-import ahead of an event.
5. **Front-desk check-in (fallback).** When the kiosk isn't used, staff select a
   visitor and check them in; one call handles visit match/create and the badge
   pipeline. A last-resort path, not the primary one.

---

### App 2 — Mapping App

**Purpose.** The tooling SafePass operators use to **stand up and calibrate a
location**: configure buildings and floors, align floorplans to the real world, draw
geofences, define calibration routes, collect WiFi fingerprint data, and publish the
radio maps the tracking solver runs on. It is a setup-and-calibration tool — dense,
map-first, correctness over polish. It does **not** visualize live or historical
tracking — that lives in the Visitor Management app.

**Primary users / roles:**

- SafePass operators / global setup staff — the primary users, standing up and
  calibrating locations.
- `org_admin` / `site_admin` / `owner` — calibration, publishing, and route/version
  management for their own org where permitted.
- `device_manager` — device visibility during calibration.

Calibration write operations generally require `org_admin+`. Device-facing
fingerprint commands are service-token protected and must never be exposed as a
browser-held secret — the UI may only trigger server-mediated actions through
approved API surfaces.

**Screen / feature inventory:**

| Area | What the user does | Key behaviors the UI must handle |
| --- | --- | --- |
| App shell & access | Sign in, pick org → building → floor | Auth bootstrap; building/floor selectors driven by grants; honor scope narrowing; no-access state |
| Floorplan management | Upload a floorplan and align it to the world | Media upload (request → PUT → complete); store anchor lat/lng, scale (m/px), rotation, pixel dimensions; allow draft floorplans with missing transforms; render incomplete transforms as **uncalibrated** rather than drawing misleading overlays |
| Coordinate handling | Place/inspect points on the floorplan | Lat/lng is ground truth; convert GPS↔pixels client-side from anchor/scale/rotation using a tested geospatial library; never mutate stored coordinates when the image is shifted/scaled/rotated |
| Floor geofences | Draw/edit optional per-floor geofence zones | GeoJSON Polygon/MultiPolygon FeatureCollection editor on the floorplan canvas; ETag/If-Match writes; "not configured" renders as an empty editor, not an error; never block calibration/publish on a missing geofence |
| Route & waypoint editing | Define calibration routes and waypoints | Route CRUD; waypoint create/reorder/edit/delete adjacent to the map canvas; label-only "Renumber" that reorders labels without moving coordinates; ETag/If-Match writes; re-fetch + retry on 409 conflicts |
| Route versioning | Manage versions of a route | Versions sorted by number; clearly mark the active version (only active feeds the solver); create/activate/delete; enforce the max-five-versions cap; block/explain deletes of active versions or those with active sessions; refresh radio-map status after activation (async publish) |
| Calibration sessions | Run a fingerprint-collection session | Create with ≥1 badge/device; live per-device and per-waypoint sample progress (poll ~2–3s while collecting); warn when a badge has zero samples after ~60–70s at a waypoint; allow continuing with partial data; complete/abandon (abandon retains fingerprints); delete fingerprints all or per-waypoint for recalibration |
| Fingerprint QA / coverage | Assess calibration quality | Coverage summaries; stale / unpublished indicators |
| Radio-map publishing | Publish a building's radio map | Show server-authoritative status (published?, version, fingerprint count, published-at, source, stale + reason + since); deliberate publish action; disable while a publish is in flight; treat "radio map disabled" as a config issue, not user error; never auto-publish on every fingerprint write |

**Key user journeys:**

1. **Stand up a new floor.** Operator uploads a floorplan, aligns it (anchor + scale
   + rotation), and confirms it reads as calibrated.
2. **Calibrate.** Operator defines a route with waypoints, runs a calibration session
   with one or more badges walking the route, monitors live sample progress, and
   completes the session.
3. **Publish.** Operator reviews coverage/staleness and deliberately publishes the
   building's radio map, then confirms the new published status.

---

## 5. Cross-cutting functional requirements

These apply to every screen in both apps. They come from the existing API contract,
so they are requirements, not preferences. Per-endpoint specifics are in the OpenAPI spec.

- **Authorization is server-side.** Bootstrap from `/v1/whoami` + `/v1/auth/scopes`;
  re-fetch on `membership_version` change or unexpected 403; render a no-access state
  rather than retrying into a wall.
- **Per-app confinement.** Each app's token is confined to that app's endpoint
  allowlist; a "wrong source" 403 is a build-time misconfiguration, not a runtime user
  state. Build each app's API client against its own allowlist only.
- **Tenant safety.** Cross-org or out-of-scope resources may return **404** by design
  (anti-leak). Direct-link routes, filters, and expands must all stay tenant-safe and
  tolerate that 404.
- **Concurrency.** Update screens must honor ETag / `If-Match`; on conflict, re-fetch
  and offer a clean retry path.
- **Idempotency.** Mutations send an `Idempotency-Key` so retries are safe.
- **Errors.** Branch on the stable RFC7807 `code`, never on free-text `detail`.
  Surface a request ID for support.
- **Media.** All photo/logo/floorplan/badge URLs are signed and short-lived. Store
  media IDs, not URLs; do not cache URLs beyond the current render/session.
- **Lists.** Use keyset pagination with opaque cursors; use server filters and
  `expand`/`include` to avoid client-side N+1 fetches.
- **Polling.** Where the app polls (notifications, dashboards, calibration progress,
  live tracking), keep it bounded and stop on 401/403.
- **Time.** Render scope-local times in the resolved scope timezone, not raw UTC.

---

## 6. Out of scope

To keep quotes comparable, the following are **not** part of either build:

- The backend/API and the hosted `auth.safepass.com` login product — SafePass runs these.
- Organization administration and the self-service kiosk — handled separately by SafePass.
- Anything requiring a server-side secret or backend infrastructure (the tracking solver,
  face-recognition, device firmware) — backend concerns, not client work.
- Separate native iOS/Android codebases — the web app is the single implementation,
  wrapped thinly by Capacitor.

---

## 7. Accompanying material

A focused **OpenAPI 3.1 specification** covering exactly the endpoints these two apps
use accompanies this brief — the authoritative source for paths, request/response
shapes, and error codes. Further backend architecture and standards documentation is
available on engagement.
