# Build plan — SafePass Manager (Visitor Management app)

> **Status:** Living reference · last verified 2026-07-20

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
comments when resolved): ~~`POST /v1/visits/{id}/confirm`~~ resolved
2026-07-12 — allowed under this app's backend policy (see CLAUDE.md
"Backend app-client authorization gate"); sentinel-ui bootstraps
`GET /v1/me` while the subset lists `/users/me`; token refresh — resolved
2026-07-10 (silent refresh via the bridge refresh grant, in AuthContext).

**Backend app-client gate (implemented 2026-07-12):** deny-by-default
per-client policy is live server-side; this app's policy ("G") allows its
whole current call surface and deliberately excludes visitor delete, photo
listing, bulk template, badge-swipes, and devices reads — full detail in
CLAUDE.md. Enablement per environment via the backend's
`COGNITO_MANAGER_AUDIENCE` switch.

**Ported from the mapping app (2026-07-13):** (a) auth resilience — shared
defensive token-endpoint POST (non-JSON gateway errors surface HTTP status),
`freshToken.js` refresh provider (dedupe, 10s throttle, rotation, race guard,
NON-terminal failure), threshold-gated 401 sign-out in AuthContext (2 in 120s;
never on a still-valid token — that's authz/config), one-shot forced-refresh
401 retry at the managerApi seam replaying the same Idempotency-Key; (b)
native OAuth is now the LIVE-WEB-VIEW in-place flow — no in-app browser, no
`safepassmanager://` scheme (redirect URIs default to
`window.location.origin`); (c) scope drill-down — `scopeHierarchy.js` (pure,
verbatim) + `/scope` ScopePicker: org (from session) → division → location →
building (terminal — no floors here), auto-select-single above building,
clickable breadcrumb, cursor-drained list fetches, selection persisted per-org
(`safepass.scope.<orgId>`).

## Decisions inherited (do not re-litigate)

Per `HANDOFF-DECISIONS.md`: JS not TS (D3), hosted `server.url` Capacitor model (D1),
CapacitorHttp disabled (D2), auth only via `auth.safepass.com` bridge (D4), Hosted UI
+ PKCE (D5), tokens in-memory on web (D6), one error taxonomy (D13), pure-logic
extraction with tests beside source (D11), copy-per-app seeding (D12).

## Decisions (confirmed with owner 2026-07-10)

| # | Decision | Resolution |
|---|---|---|
| 1 | Cognito app client ID | Provisioned 2026-07-10: `5grgviekbiv44ab9llnsdqnp55` (in `.env.example` as `VITE_COGNITO_CLIENT_ID`). Callback-URL registration + bridge passthrough per HANDOFF-AUTH-TEMPLATE still to verify |
| 2 | Hostname / scheme | `manage.safepass.com`; deep-link `safepassmanager://`; `appId` `com.safepass.manager` |
| 3 | App slug | `manager` (repo already `safepass-manager-app`; accepted deviation from the `safepass-<name>-web` naming shape) |
| 4 | Credential persistence (kiosk Layer 2's keystore half) | **No** — attended app, personal login, tokens in-memory on web. Persistence files (`secureStorage`, `kioskCredentials`, restore/refresh failure policies) removed |
| 5 | DPoP sender-constrained sessions | **Planned, deferred** (reconfirmed 2026-07-20 — current CSP + auth hardening is sufficient for now; DPoP comes later). Owner leans yes given this app's elevated admin power; requires backend support (manager-surface session exchange + proof validation), scheduled as the later hardening phase. Mainline keeps only the `dpop.js` primitive + `managerApi`'s `attachProof` hook (the one-seam retrofit point). A full session surface (`dpopSession.js`, `VITE_AUTH_DPOP_ENABLED` flag, ApiContext wiring, `docs/auth-dpop.md`) was prototyped and **archived unmerged on `archive/initial-DPoP-work`** — a reference prototype, not shipped code; re-apply once the backend `/v1/auth/session` bind/refresh endpoints exist |
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

## Phase 0.5 — UI foundation port from sentinel-ui ✅ (shipped 2026-07-10)

Ported so every subsequent screen is built once, in the house style:

- SCSS theme tree copied verbatim (datum → custom → customizer import order;
  Bootstrap source is bundled in-tree so no `bootstrap` npm dep). Deviations
  from upstream, deliberate: DM Sans self-hosted via `@fontsource` (CSP has
  no external style/font sources; on-prem goal) replacing the Google Fonts
  `@import`; Bootstrap's `tests/` scaffolding dropped; named Sass
  deprecations silenced in `vite.config.js` (upstream tech debt — migrate in
  sentinel-ui first, then re-port).
- FontAwesome 6 Free imported explicitly (`all.min.css`) — sentinel-ui lists
  the dep but no import was found there; classes follow its `fas fa-*` docs.
- Components ported: `Card`, `SectionCard`, `ConfirmModal` (+
  `useConfirmModal`), `RowActions`, `FlashOverlay` + `flashProvider`
  (`useFlash`). `SimpleTable`/`CursorList`/`PageHeader` deferred — they
  depend on session/scope providers and the router (Phase 1+).
- Domain libs copied: `statusVariants.js` (+test), `visitHelpers.js` (+
  `format/datetime.js`), `useScopedPolling.js` (one-line adapt:
  `isPermissionError` now exported from `managerApi.js`). `accessPolicy.js`
  adaptation deferred to Phase 1 (wires into the API seam).
- react-bootstrap 2.10 runs on React 19 — no pin-back needed.
- Login/Home restyled on the system; lint/tests/build fully clean (zero
  warnings — user requirement).

## Core screens v1 ✅ (shipped 2026-07-10, `feat/phase1-core-screens`)

First user-visible cut, fully drivable on the stateful mock: routed shell
(navy sidebar, offcanvas below lg, pinned topbar), Dashboard (live metric
tiles + notification feed), Visitors (server-filtered keyset-paginated
directory, create/edit modal with If-Match, detail + visit history), Visits
(15s-polled ops list, lifecycle actions gated by ported `visitHelpers`,
badge-pipeline chips), Notifications (shared provider: 15s poll, optimistic
read-state, sidebar unread badge). One-call front-desk check-in from visitor
detail with gate-failure surfacing (428 review, 409 already-in). Mock
simulates the async badge pipeline so `checking_in → active → encoded_ready`
progresses live on screen.

**Live-token wiring ✅ (2026-07-10, same branch):** real sign-in now drives
the app end-to-end — SessionProvider bootstraps `/v1/whoami` (+ tolerant
provisional `/v1/auth/scopes`), reconciles the persisted org selection
(`safepass.activeOrgId`), and gates the shell with loading / no-access /
error states; every API call is org-scoped from the session (no hardcoded
org ids); silent token refresh via the bridge refresh grant (deduped, 30s
early-skew) with authoritative 401 → sign-out at the managerApi seam; sign
out ends the Hosted UI session too. Mode matrix documented in `.env.example`
— mock stays a build var (`VITE_MANAGER_MOCK`), auth bypass separately
(`VITE_MODE=dev`), so real-auth+mock-data is a supported testing posture.

Still open from the phases below: station picker on check-in, host attach,
visit scheduling, SSE notifications, dashboards beyond tiles, tracking map,
photos + bulk import, native shells. (The org/sub-scope *selector UI* has
since shipped as the `/scope` ScopePicker — see "Auth hardening &
standardization" below.)

## Auth hardening & standardization ✅ (shipped 2026-07-16 → 07-18)

Landed across `feat/auth-id-token-hardening` (PR #10), `chore/remove-mfa-gate`
(PR #12), and `fix/auth-standardization` (PR #14). This closes out the
auth thread; the current hardening posture is considered **sufficient for the
build's current phase** — DPoP (decision #5) stays deferred to the later
hardening phase, not a near-term item.

- **ID token as the bearer** (auth-contract §1): the app sends the Cognito ID
  token, not the access token — the access token carries no `email` claim and
  is rejected once `REQUIRE_ID_TOKEN_BEARER` flips on per environment.
  `pickBearerToken` in `cognitoHostedUi.js` is the single swap point; a missing
  `id_token` is an error, never a silent access-token fallback.
- **CSP + security headers**: the authoritative edge-header CSP lives in
  `public/_headers`; `main.jsx` injects an always-on `<meta>` CSP floor (dev
  AND prod) so the app is never left with zero CSP if the header isn't served.
  Keep the two in sync — edit both when a directive changes.
- **MFA gate removed** (the whole reactive surface): MFA is now enforced by
  Cognito at the POOL level (`MfaConfiguration=REQUIRED`) — Cognito owns
  enrollment + the login challenge, so a valid token IS proof of MFA. The
  backend no longer emits `MFA_REQUIRED` / `MFA_REAUTH_REQUIRED` /
  `MFA_TOTP_REQUIRED` and never trims whoami. All app code reacting to those
  was deleted (MfaRequiredNotice, AuthActionOverlay, the trimmed-whoami guard,
  the `mfa_required` session state); whoami now classifies to `ready |
  no_access` only. These apps have **no in-app MFA UI by design** — it belongs
  to Cognito's hosted login.
- **Resilience re-hardened for 15-minute ID tokens**: silent refresh runs
  ~4×/tab/hour, so refresh-infrastructure blips are routine, not exceptional.
  The forced-sign-out decision moved to the pure, tested
  `lib/authFailurePolicy.js`, which signs out ONLY on definitive session death
  — a 401 on a still-fresh token never signs out (that's an authz/config
  fault), a *transient* renew failure (bridge 5xx, network) never counts, and
  only *definitive* failures (`invalid_grant` / revoked-or-expired refresh
  token / nothing to renew with, via `isDefinitiveRefreshFailure`) are
  threshold-gated (2-in-120s). This **supersedes** the flat "2-in-120s"
  counter recorded in the mapping-app port note above.
- **Real logout kills the SSO cookie**: an explicit sign-out purges local
  session residue (`lib/sessionCleanup.js` — sessionStorage + the `safepass.*`
  localStorage selection keys) and redirects through the Cognito hosted
  `/logout` endpoint, the only thing that clears the managed-login SSO cookie.
  Without it the next "Continue" click silently re-authenticates WITHOUT
  credentials. API-driven sign-outs (401 → re-auth → resume, auth-contract §5)
  deliberately skip the hosted redirect so the surviving cookie gives one-click
  re-entry and the persisted org/scope selection is kept.

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
