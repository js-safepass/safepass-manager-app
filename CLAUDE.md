# CLAUDE.md — safepass-manager-app

SafePass Manager: a React 19 + Vite SPA for front-desk visitor management operations — monitoring (notifications, live tracking, dashboards), record management (visitors, hosts, visits), and fallback check-in. One codebase, two deployments:

1. **Web**: Cloudflare Workers static site at `https://manage.safepass.com`, auto-deployed from GitHub with CI build gates on merge to `main` (no in-repo deploy workflow).
2. **Native shell**: Capacitor 8 (`appId: com.safepass.manager`) — the shell does **not** bundle the web app: `capacitor.config.ts` sets `server.url: 'https://manage.safepass.com'`, so the WebView loads the hosted site. Web deploys reach devices without a native rebuild; native rebuilds are only for Swift/Kotlin/plugin/OAuth changes.

This app was seeded from `safepass-kiosk-web` (`HANDOFF-*.md` bundle, 2026-07-10). That bundle is the chassis rationale record. **This is an attended staff app — never describe it as a kiosk**; kiosks are a distinct SafePass product.

## Sibling reference: sentinel-ui

`~/Documents/PROJECTS/sentinel-ui` is the mature internal operator web app consuming the same DataManager `/v1` API. It is the **source of truth for API conventions, domain logic, and the design language** — mirror it rather than inventing:

- **API conventions**: its `docs/reference/front-end-API-guide.md` (backend-synced), `docs/reference/pagination-guide.md`, `docs/standards/api-patterns.md`.
- **Domain logic to keep consistent** (copy per D12, don't re-derive): `src/lib/visitHelpers.js` (visit status lifecycle), `src/lib/statusVariants.js` (status→color truth), `src/lib/useVisitFlow.js` (badge pipeline polling, 3s), `src/lib/useScopedPolling.js` (poll cadences, halt on 403), `src/lib/accessPolicy.js` (role weights; front_desk=30 is this app's floor).
- **Design system**: DM Sans, SCSS theme under `src/assets/scss` (datum → custom → customizer import order), SectionCard/SimpleTable/RowActions/CursorList patterns per its `docs/standards/design-tokens.md`, `ui-ux.md`, `components.md`. There is no shared package — port the SCSS tree (planned, see docs/build-plan.md).

Scope of THIS app stays the contractor brief (`docs/contractor-handoff/`): its Cognito client is confined to the `x-apps: visitor` + `shared` endpoint allowlist.

## Non-negotiable invariants

1. **CapacitorHttp stays disabled.** With `server.url` set, CapacitorHttp's GET proxy rewrites URLs to the server host and breaks things. The WebView has a real `https://` origin, so plain `fetch` + CORS works natively.
2. **JavaScript, not TypeScript.** `.js`/`.jsx` throughout; the `typescript` dep exists only for `capacitor.config.ts` and editor types.
3. **Production auth via the `auth.safepass.com` bridge only** — never the raw `*.amazoncognito.com` endpoint in production. Production client: `5grgviekbiv44ab9llnsdqnp55` (pool `us-gov-west-1_jpRl7DoR5`). *Owner-directed exception (2026-07-11): staging uses its own pool via its raw FIPS domain — no staging bridge exists; values in `.env.staging`.* Tokens are in-memory only on web.
4. **Every backend call goes through `src/lib/managerApi.js`** (the centralized seam). The deferred DPoP/step-up hardening retrofits at its `attachProof` hook — never add a second fetch path.
5. **App-specific backend contracts** (dated confirmations live at the decision point in code):
   - `If-Match` carries the resource's plain integer `version`, not the quoted ETag (sentinel-ui datamanager convention, verified 2026-07-10).
   - `POST /v1/visits/{id}/confirm` is allowed under this app's backend policy (verified 2026-07-12; earlier open question resolved).
   - `PATCH /v1/visits/{id}` does not exist on the backend and is not policy-allowed — visit changes go through the lifecycle actions only (backend decision "remove, don't build", 2026-07-12).
   - Provisional spec shapes (metrics group, scope tree) must be confirmed frozen before building those screens.

## Backend app-client authorization gate (implemented 2026-07-12)

The per-app confinement from the brief is now LIVE on the backend
(`sentinel-datamanager` `internal/transport/http/apppolicy.go`, branch
`feat/app-client-authorization`): deny-by-default, method-granular allowlists
keyed on the access token's `client_id` (or ID token `aud`). This app's policy
source is **"G"** — deliberately narrower than the contractor visitor app.
Denials are `403` with RFC7807 code **`APP_POLICY_DENIED`**.

- **Everything this app calls is allowed** (surveyed against
  `src/lib/managerApi.js`, verified 2026-07-12): visitors CRUD-minus-delete,
  photo upload, face-reindex, bulk create, checkin preflight/checkin/scheduled,
  visits lifecycle (create/confirm/checkout/complete/cancel/assign-badge/
  rerender-badge/events), org hierarchy reads (divisions/locations/buildings/
  stations), host-contact reads, notifications (+ stream-ticket and SSE
  stream), metrics, tracking reads, media.
- **Deliberate exclusions — NOT bugs.** These 403 `APP_POLICY_DENIED` for
  manager-app tokens by design (the contractor visitor app keeps them):
  `DELETE /v1/visitors/{id}`, `GET /v1/visitors/{id}/photos`,
  `GET /v1/visitors/bulk/template`, `GET /v1/orgs/{org}/badge-swipes`
  (+`/export.csv`), `GET /v1/devices` and `/v1/devices/{id}`. Needing one of
  these is a backend policy conversation, not a client retry.
- **Enablement is a backend environment switch**: `COGNITO_MANAGER_AUDIENCE=`
  `5grgviekbiv44ab9llnsdqnp55` (prod pool `us-gov-west-1_jpRl7DoR5`) /
  `4diu3cb4nnt78al45dv5r8iqu9` (staging pool `us-gov-west-1_NKGtVs2Rq`). Until
  the switch is set in an environment, this client's tokens are rejected as an
  unaccepted audience — a **401 on `/v1/whoami`** there looks like an auth bug
  but is the switch being off.

Tracked-but-blocked (do NOT change): prod OAuth redirect URIs still point at
the workers.dev placeholder pending `manage.safepass.com` DNS; the DPoP seam
(`src/lib/dpop.js` + managerApi `attachProof`) stays deliberately unwired —
that is the backend's next phase.

## Validate before PR

```bash
./scripts/test.sh          # local CI mirror: diff-aware lint + full tests + build
./scripts/test.sh --all    # full-repo lint (use for config/tooling changes)
```

CI (`.github/workflows/ci-pr.yml`): lint/test on PRs to `develop`; + build for `staging`/`main`; `ci_gate` is the required check. CI does **not** cover native builds.

## Branch & deploy flow

`feature branch` → PR to `develop` → `staging` → `main`. Merge to `main` triggers the Cloudflare deploy.

## Layout

```
src/
├── main.jsx        entry: runtime CSP, provider tree (Network → Auth → App)
├── App.jsx         thin auth gate (React Router lands with the first routed screens)
├── pages/          Login, Dashboard, visitors/, visits/, NotificationsInbox, ScopePicker
├── state/          contexts (Auth, Api, Network) + useFoo.js accessor hooks
└── lib/            framework-free logic, unit-tested; lib/native/ = guarded plugin wrappers
ios/, android/      committed Capacitor shells (lint-ignored; not yet generated)
docs/               design docs & plans — check the Status header; see docs/README.md
```

## Conventions

- **Pure-logic extraction**: decision-shaped code moves out of components into `src/lib/*.js` with a Vitest test file beside it. Component coverage is thin by design.
- **Platform detection**: `src/lib/platform.js` (`isNative`/`isIOS`/`isAndroid`/`isWeb`) is the single source of truth. `lib/native/*` wrappers lazy-import Capacitor plugins and no-op on web (empty catches intentional, lint-allowed).
- **Errors**: backend errors are `ManagerApiError` (code/status/details/retryAfter/requestId); user-facing text only via `getUserFacingError(err, context)`; log via `flattenErrorForLog`; permanent-vs-transient classification centralized in `retry.js`. Branch on the RFC7807 `code` (casing is inconsistent server-side — match exact-per-code), never on `detail`.
- **Lists**: keyset pagination — opaque `meta.cursor`, absent cursor = last page (never infer from page size); sort changes discard the cursor; `include_count=1` only on page 1.
- **Media**: store `media_id`s; URLs are signed and short-lived (~15 min) — fetch fresh per render, never cache.
- **Polling**: bounded, pauses when hidden, stops on 401/403. Cadences: notifications 15s focused / 60s unfocused (SSE primary + 120s poll safety net), badge pipeline 3s, metrics/tracking 15–30s.
- **Context/hook split**: `state/FooContext.jsx` (provider) + `state/useFoo.js` (accessor).
- **Comments carry the "why"**: dated backend confirmations and design narratives live in code comments — preserve and update them, don't strip them.
- **Dual build**: `npm run build` = web/Cloudflare; `npm run cap:build` (`CAP_BUILD=true`) = static SPA for `cap sync`. `CAP_SERVER_URL` overrides the shell's target at sync time.
- **Self-update**: `lib/appUpdate.js` polls `/version.json` while idle (staff leave the app open all day); never reload mid-interaction.

## Auth & infra reference

- Cognito Hosted UI via the `auth.safepass.com` bridge → AWS GovCloud Cognito. Pool `us-gov-west-1_jpRl7DoR5`, app client `5grgviekbiv44ab9llnsdqnp55`.
- Native OAuth: the shell is a LIVE web view (`server.url` = hosted origin), so OAuth navigates the web view in-place through the Hosted UI and back to `<origin>/auth/callback` — no in-app browser, no custom URL scheme (2026-07-13). Redirect/logout URIs default to `window.location.origin`; the `VITE_COGNITO_*_URI` vars are overrides only.
- API base: `https://api.safepass.com`; this client is scoped to the `x-apps: visitor` + `shared` operations in `docs/contractor-handoff/3-api-spec.yaml`.
- Env surface: all runtime config is `VITE_*` via `.env*` files (see `.env.example`); never a secret in a `VITE_` var. `VITE_MODE=dev` = auth bypass; `VITE_MANAGER_MOCK=true` = mock API (app must stay fully drivable with no backend).
- Dev server is pinned to port **5273** (`strictPort` — OAuth callbacks are registered for `localhost:5273`; other local projects hold 5173).

## Project context

- Sole developer; estimates in effort-hours/days, not calendar time.
- Phase 0 (skeleton + identity pass) complete 2026-07-10; next: UI foundation port from sentinel-ui, then API/auth bootstrap — see docs/build-plan.md.
