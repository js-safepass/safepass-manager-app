# Build plan — SafePass Manager (Visitor Management app)

> **Status:** Living reference · last verified 2026-07-10

This repo builds **App 1 — Visitor Management** from the contractor handoff package
([contractor-handoff/2-requirements-brief.md](contractor-handoff/2-requirements-brief.md)).
The Mapping app (App 2) is a separate repo, seeded the same way later. The work was
originally scoped for a contractor and is now in-house; the brief, OpenAPI spec, and
handoff bundle (`HANDOFF-*.md` at repo root) remain the requirements and standards
baseline.

Sole developer; phases are effort-ordered, not calendar-scheduled. Each phase lands
via the normal PR flow once CI/branch protection is up.

## Current state (2026-07-10, end of Phase 0)

- Git initialized; `main` / `develop` / `staging` on
  `js-safepass/safepass-manager-app`; Phase 0 on `feat/phase0-bootstrap`.
- Skeleton installed and green (`./scripts/test.sh --all`): identity pass done
  (`managerApi.js`/`ManagerApiError`), Layer-2 persistence files removed,
  `dpop.js` kept, mock-mode app boots (Login → Home against `whoami` +
  notifications).
- **Not yet present:** native shells, Cloudflare project, Cognito app client.

## Reference implementation: sentinel-ui (course correction 2026-07-10)

`~/Documents/PROJECTS/sentinel-ui` is the mature internal operator web app on
the same `/v1` API — every surface this app needs already exists there. The
original plan leaned only on the contractor OpenAPI subset; corrected posture:
**the kiosk handoff bundle stays the chassis** (Capacitor model, auth bridge,
env discipline, test/deploy flow), and **sentinel-ui is the source of truth
for everything above the chassis**:

- **API conventions** — its `docs/reference/front-end-API-guide.md`
  (backend-synced), `pagination-guide.md`, `docs/standards/api-patterns.md`.
  Confirmed: `{data, meta}` envelopes; opaque `meta.cursor` (absent = last
  page); RFC7807 with stable top-level `code` (mixed casing — match
  exact-per-code); `Idempotency-Key` on POST/PATCH/DELETE; **`If-Match` =
  plain integer `version`, not the ETag string**; media IDs stored, signed
  URLs (~15 min) fetched per render.
- **Domain logic copied per D12, not re-derived**: `visitHelpers.js` (visit
  lifecycle + eligibility), `statusVariants.js` (status→color),
  `useVisitFlow.js` (badge pipeline: derive badgeStatus from
  `badge_raw/encoded_media_id` + error fields, poll 3s),
  `useScopedPolling.js` (visibility-aware polling, halt on 403),
  `accessPolicy.js` (role weights — `front_desk`=30 is this app's floor).
- **Design system** — no shared package exists; port the SCSS theme tree
  (`src/assets/scss`, import order datum → custom → customizer), DM Sans,
  FontAwesome 6, and the component patterns (SectionCard, SimpleTable,
  RowActions, PageHeader, ConfirmModal, CursorList + useListQuery,
  modal-fields tiers) per its `design-tokens.md` / `ui-ux.md` /
  `components.md`.
- **Bootstrap/session behaviors to mirror** (its `sessionProvider.jsx` /
  `scopeProvider.jsx`): whoami + auth/scopes sequencing with monotonic
  `sessionReady`, `membership_version` reconciliation, org selection
  persisted to `localStorage['safepass.activeOrgId']` and per-org scope to
  `safepass.scope.<orgId>`, 401-failure threshold → forced logout while 403
  is never counted, notifications via SSE stream-ticket + 120s poll safety
  net (the guide's "SSE deprecated" §6 is stale — code wins).

**Discrepancies to confirm with backend** (dated confirmations go in code
comments when resolved): `POST /v1/visits/{id}/confirm` is used by sentinel-ui
but absent from the contractor OpenAPI subset; sentinel-ui bootstraps
`GET /v1/me` while the subset lists `/users/me`; token refresh — sentinel-ui
uses OIDC silent refresh, the chassis re-runs the auth flow on expiry (an
all-day attended app needs refresh; decide the mechanism in Phase 1).

## Decisions inherited (do not re-litigate)

Per `HANDOFF-DECISIONS.md`: JS not TS (D3), hosted `server.url` Capacitor model (D1),
CapacitorHttp disabled (D2), auth only via `auth.safepass.com` bridge (D4), Hosted UI
+ PKCE (D5), tokens in-memory on web (D6), one error taxonomy (D13), pure-logic
extraction with tests beside source (D11), copy-per-app seeding (D12).

## Decisions (confirmed with owner 2026-07-10)

| # | Decision | Resolution |
|---|---|---|
| 1 | Cognito app client ID | Provided later; env-var based (`VITE_COGNITO_CLIENT_ID`), not blocking — dev-bypass + mock until then |
| 2 | Hostname / scheme | `manage.safepass.com`; deep-link `safepassmanager://`; `appId` `com.safepass.manager` |
| 3 | App slug | `manager` (repo already `safepass-manager-app`; accepted deviation from the `safepass-<name>-web` naming shape) |
| 4 | Credential persistence (kiosk Layer 2's keystore half) | **No** — attended app, personal login, tokens in-memory on web. Persistence files (`secureStorage`, `kioskCredentials`, restore/refresh failure policies) removed |
| 5 | DPoP sender-constrained sessions | **Planned, deferred** — owner leans yes given this app's elevated admin power; requires backend support (manager-surface session exchange + proof validation), which the brief schedules as the later hardening phase. `dpop.js` stays seeded; `managerApi` keeps a proof-attachment hook so wiring it is a one-seam change |
| 6 | Self-update polling (D9) | **Yes** — attended app, but staff tablets/PCs sit open all day. Keep `appUpdate.js`, suppress reload mid-interaction, 8s abort on the version probe. (Terminology note: these are staff members' personal/management tablets or PCs — *not* kiosks; kiosks are a distinct product) |
| 7 | Deploy | Auto-deploy from GitHub with CI build gates (`ci_gate`), per SafePass CI structure |
| 8 | Router | Add React Router when routed screens land (Phase 1/2) — justified by tenant-safe direct-link routes and 10–15 screens |
| 9 | OTP / auth account management | **Out of scope, intentionally** — no OTP exists currently; no password update or other auth account features in this app. The centralized client seam leaves room for a re-verify step later; nothing is built for it |
| 10 | Provisional API shapes (metrics group, scope tree) — confirm frozen with backend | Build those screens last within their phase; add a dated confirmation in code comments when frozen |

## Phase 0 — Skeleton + identity pass (foundation)

Per `HANDOFF-BOOTSTRAP.md` steps 1–3:

1. Vite React (JS) skeleton, React 19, dep families per SEED-MANIFEST: Capacitor 8
   core, Vitest + jsdom, ESLint flat config, Cloudflare Vite plugin. Keep seeded
   configs (they're ahead of the generator's).
2. Identity sweep: `kioskApi.js` → `managerApi.js`, `KioskApiError` →
   `ManagerApiError`; delete every kiosk endpoint, stub this app's calls from the
   OpenAPI spec (`x-apps: visitor` + `shared` only); rewrite `.env.example` per
   AUTH-TEMPLATE; new `capacitor.config.ts` identity (`com.safepass.manager`,
   `server.url` = hostname) keeping the D1/D2 comments; `CLAUDE-TEMPLATE.md` →
   `CLAUDE.md` with placeholders filled.
3. Delete persistence files (decision #4): `secureStorage.js`, `kioskCredentials.js`,
   `restoreFailurePolicy.*`, `refreshFailurePolicy.*`. Keep `dpop.js` (decision #5).
4. Provider tree in `main.jsx` (Auth → Network → app), `App.jsx`, router, Login.
5. Mock API mode (`VITE_MANAGER_MOCK=true`) so the app is fully drivable with no
   backend. `./scripts/test.sh` green. Branch protection on `ci_gate`.

**Exit:** app boots against mock; lint/tests/build green; CLAUDE.md placeholder-free.

## Phase 0.5 — UI foundation port from sentinel-ui

Before any real screens: port the design system so every subsequent screen is
built once, in the house style.

- Deps: `react-bootstrap` + `bootstrap`, `sass`, DM Sans, FontAwesome 6 Free.
- Copy the SCSS tree from sentinel-ui `src/assets/scss/` preserving the
  datum → custom → customizer import order (customizer loads last and wins).
- Port core components: `SectionCard`, `SimpleTable`, `RowActions`,
  `PageHeader`, `ConfirmModal`, flash provider (`useFlash` cadence:
  success 6s / info 8s / warning 10s / error 12s), loading/empty-state
  conventions. `CursorList` + `useListQuery` come with the first list screen.
- Copy domain libs with tests: `statusVariants.js`, `visitHelpers.js`,
  `useScopedPolling.js`; adapt `accessPolicy.js` to this app's allowlist.
- Risk to verify early: react-bootstrap on React 19 (sentinel-ui is React 18).
  If it fights, pinning React 18 here is acceptable — flag it as a deviation
  from the chassis' React 19 line before doing so.

## Phase 1 — API client layer + auth bootstrap (the seam everything sits on)

The brief's §5 cross-cutting requirements all live in the **centralized client
layer** — this is also the contractual "single seam" for the deferred DPoP/step-up
retrofit, so it must be the only place requests are made:

- RFC7807 parsing → `ManagerApiError` branching on stable `code`, surfacing request ID
- `Idempotency-Key` on mutations; ETag capture + `If-Match` on updates, with a
  re-fetch-and-retry conflict path
- Keyset pagination helper (opaque cursors), `expand`/`include` support
- Signed-URL discipline: store media IDs, never cache URLs across renders/sessions
- Tenant-safe 404 handling; bounded polling that stops on 401/403

Organize endpoints into namespaced modules mirroring sentinel-ui's
datamanager (`attachX(ctx)` per resource, per-namespace version cache feeding
If-Match, `listPage`/auto-paginating `list`), and add token refresh (see the
discrepancy note above — decide silent-refresh mechanism against the bridge).

Auth: Layer 1 per AUTH-TEMPLATE (dev callback first, hosted later). Bootstrap
`/v1/whoami` + `/v1/auth/scopes` mirroring sentinel-ui's sessionProvider
semantics (monotonic `sessionReady`, membership_version reconciliation,
401-threshold logout / 403 not counted, org + scope persistence keys); scope
selector (org → division → location → building → station) driven by grants;
no-access state. Scope-local timezone resolution utility.

**Exit:** login round-trips in dev; scope selection works against mock; every
cross-cutting behavior has a unit-tested `lib/` module.

## Phase 2 — Visitor & visit records (the CRUD core)

- Visitor directory: server filters (status/name/type/company/review-queue/
  geofence-breach), keyset pagination, signed thumbnails
- Visitor detail: photos, identity/face state, history; archived/deleted/merged/
  retained handled gracefully
- Create/edit visitor: idempotent create with the **three outcomes** (created 201 /
  existing reused 200 / merge candidate emitted); host-contact fields inline
- Host attach: picker + suggest (`/host-contacts/suggest`), free-text with
  server-dedupe conflict prompt (keep / merge / overwrite), notify preferences
- Visit scheduling: org/location context, open-ended windows, full status lifecycle;
  visit actions (checkout / complete / cancel) with per-status enablement
- Kiosk-originated visits shown read-only alongside desk-created ones

**Exit:** journeys 2 & 4 ("review a visitor/visit", "manage records") complete
against mock, then verified against staging.

## Phase 3 — Front-desk operations

- Check-in: station picker (`GET /orgs/{orgID}/stations`, persistent, read-only),
  optional preflight driving button state, `POST /visitors/{id}/checkin` → 202 +
  async `checkin_status`; gate failures mapped in `userErrors.js` (428 review/
  background-check, 409 already-in / no-badges, 429 queue full, 503 unavailable)
- Badge pipeline: port sentinel-ui's `useVisitFlow.js` (badgeStatus from
  `badge_*_media_id`/error fields, 3s poll with hidden-tab backoff); hidden
  entirely when `badge_tracking=false`; retry via rerender-badge; badge URLs
  treated as short-lived
- Notifications: port sentinel-ui's notificationsProvider (SSE via
  stream-ticket, re-ticket after 3 consecutive errors + 5s, 120s poll safety
  net, optimistic mark-read with revert, `read_at`-derived unread, defensive
  normalization); unknown types render safely

**Exit:** journey 5 (fallback check-in) end-to-end on staging with a real badge
pipeline; journey 1's notification half live.

## Phase 4 — Monitoring: dashboards + live tracking

- Operational dashboards: preset visitor/tracking/ops metrics; scope-timezone
  rendering; expands to avoid N+1 (⛔ needs metrics shapes frozen — decision #8)
- Live tracking map: `GET /orgs/{org}/tracking/map` poll 15–30s, active/checking-in/
  checking-out visitors on the calibrated floorplan; GPS↔pixel conversion
  client-side (tested `lib/` module — floorplan config is read-only here);
  "no data yet" state
- Historical trace from visit detail (`/visits/{id}/tracking` + `/tracking/trace`)

**Exit:** journeys 1 & 3 complete — the app's "day-to-day center of gravity" works.

## Phase 5 — Photos + bulk import

- Photo enrollment: media upload (request → PUT → complete), face-index error
  catalogue (no face / low quality / unsupported / failed)
- CSV bulk import: template download, submit, per-row outcomes

## Phase 6 — Native shells + ship polish

- `npx cap add ios android` fresh (never copy kiosk shells); deep-link scheme
  registration; camera / push / haptics via `lib/native/` wrappers
- `docs/deployment/` for the Cloudflare project; hosted auth callbacks registered;
  `.env.production`
- If decision #5 = yes: keep `appUpdate.js`, suppress reload mid-interaction, 8s
  AbortController timeout on the version probe (KNOWN-ISSUES)

Native shells are deliberately last — the web build ships value alone (D1), and
phases 1–5 are fully testable in a desktop browser + mock.

## Deferred / out of scope (recorded so nobody "helpfully" adds them)

- Review-queue approval workflow — web UI first, this app in a later phase
- DPoP sender-constrained sessions + action-scoped step-up — later hardening phase;
  the Phase-1 client seam is the retrofit point
- Mapping app — separate repo; badge printing, barcode/QR — explicitly not features
- Backend, login product, org administration, kiosk — SafePass-run, not built here
