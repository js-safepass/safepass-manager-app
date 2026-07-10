# STANDARDS — the SafePass app chassis

> **Status:** Living reference · last verified 2026-07-10
> Distilled from `safepass-kiosk-web`. Where this doc and that repo's code disagree, the code wins.

Every SafePass client app is **one codebase, two deployments**:

1. **Web**: a Vite-built SPA served as Cloudflare Workers static assets, auto-deployed by Cloudflare's dashboard Git integration on merge to `main` (no in-repo deploy workflow).
2. **Native shell**: a thin Capacitor 8 wrapper whose WebView loads the **hosted** site (`server.url` in `capacitor.config.ts`). The shell does **not** bundle the web app. Web deploys reach devices without a native rebuild; native rebuilds are only for Swift/Kotlin/plugin/OAuth-scheme changes.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| UI | React 19 + Vite | SPA, no router library in the kiosk (state-machine routing in `App.jsx`); add a router only if the app genuinely needs URLs |
| Language | **JavaScript** (`.js`/`.jsx`) | No TypeScript files. The `typescript` dep exists only for `capacitor.config.ts` and editor types. See [DECISIONS.md](DECISIONS.md#d3) |
| Native | Capacitor 8, hosted `server.url` model | `CapacitorHttp` **disabled** — plain `fetch` + CORS works because the WebView has a real `https://` origin. See [DECISIONS.md](DECISIONS.md#d2) |
| Auth | Cognito Hosted UI via `auth.safepass.com` bridge, PKCE, per-app app client | See [AUTH-TEMPLATE.md](AUTH-TEMPLATE.md) |
| Hosting | Cloudflare Workers static assets | Git integration deploy on `main` |
| Tests | Vitest + jsdom, test files **beside** source | `src/lib/foo.js` + `src/lib/foo.test.js` |
| Lint | ESLint flat config | `ios/`/`android/` lint-ignored |

## Repo layout

```
src/
├── main.jsx        entry: browser gate (VITE_BLOCK_BROWSER_ACCESS), runtime CSP, provider tree
├── App.jsx         top-level state router
├── pages/          screens + their components
├── state/          contexts (Auth, Network, …) + useFoo.js accessor hooks
├── hooks/          device/display hooks
└── lib/            framework-free logic, unit-tested; lib/native/ = guarded plugin wrappers
ios/, android/      committed Capacitor shells (lint-ignored)
docs/               design docs & plans, each with a Status header; docs/README.md is the index
scripts/test.sh     local CI mirror
handoff/            (kiosk repo only) this bundle
```

## Code conventions

- **Pure-logic extraction**: decision-shaped code moves out of components into `src/lib/*.js` with a test file beside it. Component test coverage is thin *by design*; the logic worth testing shouldn't live in components.
- **Platform detection**: `src/lib/platform.js` (`isNative` / `isIOS` / `isAndroid` / `isWeb`) is the single source of truth. Never sniff `Capacitor` directly in feature code.
- **Native plugin access**: `lib/native/*` wrappers lazy-import Capacitor plugins and no-op on web. Empty `catch {}` blocks there are intentional and lint-allowed.
- **Errors, one taxonomy**:
  - Backend errors are instances of one API error class (`KioskApiError` in the kiosk; rename per app) carrying `code` / `status` / `details` / `retryAfter`.
  - User-facing text **only** via a `getUserFacingError(err, context)` mapper (`lib/userErrors.js`) — components never hand-roll error strings.
  - Logging via `flattenErrorForLog` (`lib/errorLog.js`).
  - Permanent-vs-transient classification centralized in `lib/retry.js`; nothing else decides what's retryable.
- **Context/hook split**: `state/FooContext.jsx` (provider component) + `state/useFoo.js` (context object + accessor hook). This keeps react-refresh lint happy and is the established pattern.
- **Comments carry the "why"**: dated backend confirmations (`Confirmed with backend 2026-06: …`), phase narratives, and superseded-architecture warnings live in code comments. Preserve and update them; never strip them.
- **Env surface**: all runtime config is `VITE_*` via `.env*` files. `.env` is gitignored; `.env.example` documents everything; `.env.production` is committed and holds public client-side config only. **Never a secret in a `VITE_` var** — they're baked into the public bundle.

## Docs conventions

Every doc in `docs/` carries a status header under its title:

```
> **Status:** <Living reference | Historical plan — shipped | Superseded — see X> · last verified YYYY-MM-DD
```

`docs/README.md` indexes them by status. Living references are updated **in the same PR** as the change they describe. Historical plans keep their original rationale and get an "Outcome / what shipped" note instead of a rewrite. When a doc disagrees with the code, the code wins.

## Validation & CI

```bash
./scripts/test.sh          # local CI mirror: diff-aware lint + full tests + build
./scripts/test.sh --all    # full-repo lint (use for config/tooling changes)
```

CI (`.github/workflows/ci-pr.yml`): lint + test on PRs to `develop`; lint + test + build on PRs to `staging`/`main`; `ci_gate` is the single required check. CI does **not** cover native builds — `xcodebuild`/Gradle validation is local via Xcode/Android Studio.

## Branch & deploy flow

`feature branch` → PR to `develop` → `staging` → `main`. Merge to `main` triggers the Cloudflare deploy.

**If the app runs unattended** (kiosk-style), deployed devices don't reload on deploy: they poll `/version.json` while idle and self-reload when the baked `__APP_BUILD_ID__` differs (`src/lib/appUpdate.js`, reloads capped per build id). An attended app where users refresh normally can skip this.

## Dual build

- `npm run build` — web/Cloudflare build (includes the Cloudflare Vite plugin).
- `npm run cap:build` (`CAP_BUILD=true`) — plain static SPA for `cap sync`.
- `CAP_SERVER_URL` overrides the native shell's target at sync time (point a dev device at a preview URL or local dev server). The kiosk wires this into Xcode Debug/Release via `ios/scripts/select-server-url.sh`.

## Per-app identity checklist

Each new app needs its own:

| Item | Kiosk value (for shape) | New app |
|---|---|---|
| Repo name | `safepass-kiosk-web` | `safepass-<name>-web` |
| Capacitor `appId` | `com.safepass.kiosk` | `com.safepass.<name>` |
| Deep-link scheme | `safepasskiosk://` | `safepass<name>://` |
| Cognito app client | `469o45rb474u57fba3ecnd0lkv` | dedicated client, same pool |
| Hostname | `kiosk.safepass.com` | `<name>.safepass.com` |
| API error class name | `KioskApiError` | `<Name>ApiError` (same fields) |
