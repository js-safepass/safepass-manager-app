# CLAUDE.md — safepass-{{APP_SLUG}}-web

<!-- TEMPLATE: replace every {{PLACEHOLDER}}, delete sections marked (Layer 2) if this app skipped Layer 2 (see the kiosk repo's handoff/AUTH-TEMPLATE.md), then delete this comment. -->

SafePass {{APP_DISPLAY_NAME}}: a React 19 + Vite SPA for {{ONE_LINE_PURPOSE}}. One codebase, two deployments:

1. **Web**: Cloudflare Workers static site at `https://{{HOSTNAME}}`, auto-deployed by Cloudflare's dashboard Git integration on merge to `main` (no in-repo deploy workflow).
2. **Native shell**: Capacitor 8 (`appId: com.safepass.{{APP_SLUG}}`) — the shell does **not** bundle the web app: `capacitor.config.ts` sets `server.url: 'https://{{HOSTNAME}}'`, so the WebView loads the hosted site. Web deploys reach devices without a native rebuild; native rebuilds are only for Swift/Kotlin/plugin/OAuth changes.

This app was seeded from `safepass-kiosk-web` (`handoff/` bundle, {{SEED_DATE}}). That repo's `handoff/STANDARDS.md` and `handoff/DECISIONS.md` are the rationale record; this file is self-sufficient for day-to-day work.

## Non-negotiable invariants

1. **CapacitorHttp stays disabled.** With `server.url` set, CapacitorHttp's GET proxy rewrites URLs to the server host and breaks things. The WebView has a real `https://` origin, so plain `fetch` + CORS works natively.
2. **JavaScript, not TypeScript.** `.js`/`.jsx` throughout; the `typescript` dep exists only for `capacitor.config.ts` and editor types.
3. **Auth via the `auth.safepass.com` bridge only** — never the raw `*.amazoncognito.com` endpoint. This app's dedicated app client: `{{APP_CLIENT_ID}}` (pool `us-gov-west-1_jpRl7DoR5`). Tokens are in-memory only on web.
4. *(Layer 2)* **A network blip during cold-start restore must never wipe persisted credentials** (`src/lib/restoreFailurePolicy.js`).
5. {{APP_SPECIFIC_BACKEND_CONTRACTS — record dated backend confirmations here as they happen, like the kiosk's candidate-filtering invariant}}

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
├── main.jsx        entry: runtime CSP, provider tree
├── App.jsx         top-level state router
├── pages/          {{LIST_MAIN_SCREENS}}
├── state/          contexts (Auth, Network{{, …}}) + useFoo.js accessor hooks
└── lib/            framework-free logic, unit-tested; lib/native/ = guarded plugin wrappers
ios/, android/      committed Capacitor shells (lint-ignored)
docs/               design docs & plans — check the Status header; see docs/README.md
```

## Conventions

- **Pure-logic extraction**: decision-shaped code moves out of components into `src/lib/*.js` with a Vitest test file beside it. Component coverage is thin by design.
- **Platform detection**: `src/lib/platform.js` (`isNative`/`isIOS`/`isAndroid`/`isWeb`) is the single source of truth. `lib/native/*` wrappers lazy-import Capacitor plugins and no-op on web (empty catches intentional, lint-allowed).
- **Errors**: backend errors are `{{Name}}ApiError` (code/status/details/retryAfter); user-facing text only via `getUserFacingError(err, context)`; log via `flattenErrorForLog`; permanent-vs-transient classification centralized in `retry.js`.
- **Context/hook split**: `state/FooContext.jsx` (provider) + `state/useFoo.js` (accessor).
- **Comments carry the "why"**: dated backend confirmations and design narratives live in code comments — preserve and update them, don't strip them.
- **Dual build**: `npm run build` = web/Cloudflare; `npm run cap:build` (`CAP_BUILD=true`) = static SPA for `cap sync`. `CAP_SERVER_URL` overrides the shell's target at sync time.

## Auth & infra reference

- Cognito Hosted UI via the `auth.safepass.com` bridge → AWS GovCloud Cognito. Pool `us-gov-west-1_jpRl7DoR5`, app client `{{APP_CLIENT_ID}}`.
- Native OAuth: in-app browser + `safepass{{APP_SLUG}}://localhost/auth/callback` deep link.
- API base: `{{API_BASE}}`; this client is scoped to {{PERMITTED_API_SURFACE}}.
- Env surface: all runtime config is `VITE_*` via `.env*` files (see `.env.example`); never a secret in a `VITE_` var.

## Project context

- Sole developer; estimates in effort-hours/days, not calendar time.
- {{CURRENT_PHASE_NOTES}}
