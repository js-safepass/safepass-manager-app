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

## Current state (2026-07-10)

- Git initialized; `main` / `develop` / `staging` pushed to
  `js-safepass/safepass-manager-app`.
- Chassis seeded from `safepass-kiosk-web` — still carrying **kiosk identity**
  (`kioskApi.js`, `KioskApiError`, kiosk env vars, kiosk `capacitor.config.ts`).
- **Not yet present:** `package.json` (no installable skeleton), `App.jsx`,
  `CLAUDE.md` (template only), native shells (`ios/` has only scripts), Cloudflare
  project, Cognito app client.

## Decisions inherited (do not re-litigate)

Per `HANDOFF-DECISIONS.md`: JS not TS (D3), hosted `server.url` Capacitor model (D1),
CapacitorHttp disabled (D2), auth only via `auth.safepass.com` bridge (D4), Hosted UI
+ PKCE (D5), tokens in-memory on web (D6), one error taxonomy (D13), pure-logic
extraction with tests beside source (D11), copy-per-app seeding (D12).

## Decisions needed from the human (blockers marked ⛔)

| # | Decision | Default / recommendation |
|---|---|---|
| 1 | ⛔ Cognito app client ID for this app (dedicated client, pool `us-gov-west-1_jpRl7DoR5`; checklist in `HANDOFF-AUTH-TEMPLATE.md`) | Blocks real auth; mock/dev-bypass unblocks everything else |
| 2 | ⛔ Hostname | Suggest `manage.safepass.com`; deep-link scheme `safepassmanage://` |
| 3 | App slug | `manager` (matches repo name; STANDARDS suggests `safepass-<name>-web` repo naming — repo is already `safepass-manager-app`, accepted deviation) |
| 4 | Layer 2 (device sessions / DPoP / secure persistence)? | **No** — attended app, personal login (AUTH-TEMPLATE worksheet default). Confirm, then delete Layer-2 seeded files |
| 5 | Self-update polling (D9)? | Front desk may leave a tablet running all day — lean **yes, keep `appUpdate.js`**. Confirm |
| 6 | ⛔ Cloudflare project (human creates in dashboard; note naming caveat in kiosk `docs/deployment/cloudflare-pages.md`) | Blocks hosted deploys only |
| 7 | Router | **Add React Router** — deviation from kiosk state-router, justified: brief requires tenant-safe direct-link routes to visitors/visits, and 10–15 screens |
| 8 | Provisional API shapes (metrics group, auth scope/OTP group, scope tree) — confirm frozen with backend | Build those screens last within their phase; put a dated confirmation in code comments when frozen |

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
3. Delete Layer-2 files once decision #4 confirms: `dpop.js`, `secureStorage.js`,
   `kioskCredentials.js`, `restoreFailurePolicy.*`, `refreshFailurePolicy.*`.
4. Provider tree in `main.jsx` (Auth → Network → app), `App.jsx`, router, Login.
5. Mock API mode (`VITE_MANAGER_MOCK=true`) so the app is fully drivable with no
   backend. `./scripts/test.sh` green. Branch protection on `ci_gate`.

**Exit:** app boots against mock; lint/tests/build green; CLAUDE.md placeholder-free.

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
- Generic "verify again" OTP step (`/auth/otp/*`) as a reusable prompt

Auth: Layer 1 per AUTH-TEMPLATE (dev callback first, hosted later). Bootstrap
`/v1/whoami` + `/v1/auth/scopes`; scope selector (org → division → location →
building → station) driven by grants; re-fetch on `membership_version` change or
unexpected 403; no-access state. Scope-local timezone resolution utility.

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
- Badge pipeline: hidden when badge tracking off; render/encode progress, errors,
  retry/re-render per state+permissions; badge URLs treated as short-lived
- Notifications: poll ~15s focused / ~60s unfocused, SSE stream via stream-ticket
  with re-ticket on reconnect; mark-read single + bulk; unknown types render safely

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
