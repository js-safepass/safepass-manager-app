# DECISIONS — why the chassis is shaped this way

> **Status:** Living reference · last verified 2026-07-10
> ADR-style. Each entry: the decision, the context that forced it, and what NOT to do. New apps inherit these unless a decision explicitly says it's optional.

## D1 — Hosted `server.url` Capacitor model

**Decision:** The native shell does not bundle the web app. `capacitor.config.ts` sets `server.url` to the hosted site; the WebView loads production directly.

**Why:** Web deploys reach every installed device instantly with no App Store / Play release. Native rebuilds are needed only for Swift/Kotlin/plugin/OAuth-scheme changes. For a sole developer shipping to devices in the field, this collapses the release pipeline to "merge to main."

**Consequences:** The WebView has a real `https://` origin (enables D2). Devices need connectivity to boot the app. Use `docs/native-app-change-impact-map.md` (kiosk repo) to reason about what needs a native rebuild.

## D2 — CapacitorHttp disabled; plain `fetch` + CORS

**Decision:** `CapacitorHttp` stays disabled in every app using the hosted model.

**Why:** With `server.url` set, CapacitorHttp's GET proxy rewrites request URLs to the server host and breaks API calls. Because the WebView origin is a real `https://` domain (D1), plain `fetch` + CORS works natively — no proxy needed.

**Do not:** reintroduce the old `capacitor://` origin + CapacitorHttp + base64-upload architecture, even if an older doc or comment describes it. It is **superseded**.

## D3 — JavaScript, not TypeScript

**Decision:** `.js`/`.jsx` throughout. The `typescript` dependency exists only for `capacitor.config.ts` and editor types.

**Why:** Deliberate simplicity for a sole-developer codebase; type-shaped safety comes from pure-logic extraction + unit tests (D11) instead. Revisit only as an explicit whole-team decision, never by letting `.ts` files creep in.

## D4 — Auth bridge domain, never raw Cognito

**Decision:** All Hosted UI traffic goes through `https://auth.safepass.com`, a bridge in front of AWS GovCloud Cognito.

**Why:** GovCloud Cognito does not support custom domains natively; the bridge provides the stable branded domain. The raw `*.amazoncognito.com` endpoint must never appear in configs — it would couple every client to a GovCloud implementation detail and break if the pool moves.

**Shared infra:** user pool `us-gov-west-1_jpRl7DoR5`. Each app gets its **own app client** (dedicated client ID, callback URLs, and token scopes) — see [AUTH-TEMPLATE.md](AUTH-TEMPLATE.md).

## D5 — OAuth: Hosted UI + PKCE; native uses in-app browser + deep link

**Decision:** Authorization-code flow with PKCE (`lib/pkce.js`, `lib/cognitoHostedUi.js`). On web the redirect returns to `/auth/callback`; on native, an in-app browser opens the Hosted UI and the callback is a custom-scheme deep link (`safepass<app>://localhost/auth/callback`).

**Why:** Public client (no secret possible in a SPA/WebView); PKCE is the standard mitigation. The deep-link scheme is per-app so installs don't collide.

## D6 — Tokens in-memory on web; native persists via a custom SecureStorage plugin

**Decision:** On web, auth tokens live in memory only — no localStorage/sessionStorage. On native, credentials persist to the platform keystore (iOS Keychain; Android equivalent) through a **custom, in-repo** SecureStorage plugin, not a community dependency.

**Why:** Web storage is XSS-exfiltratable; a page refresh re-auths and that's acceptable. Native apps must survive cold starts unattended, so they persist — but to hardware-backed storage, via a plugin small enough to audit and own (supply-chain caution; the Android Kotlin equivalent was likewise written in-repo).

**Schema:** versioned credential schema (v3 as of 2026-07) in `lib/kioskCredentials.js` — keep the version-and-migrate pattern in new apps that persist.

## D7 — Never wipe persisted credentials on a transient failure

**Decision:** A network blip during cold-start restore must never wipe the keystore. Failure classification (`lib/restoreFailurePolicy.js`, `lib/refreshFailurePolicy.js`) distinguishes *permanent* (server said no — wipe and re-auth) from *transient* (couldn't reach server — keep credentials, retry).

**Why:** Hard-won from unattended-kiosk operation: a device that wipes its credentials on a Wi-Fi hiccup is a device someone must physically visit. Any app that persists credentials (D6) inherits this policy.

## D8 — DPoP-bound sessions *(optional layer — take if the app holds a long-lived device session)*

**Decision:** Kiosk sessions are DPoP-bound (`lib/dpop.js`): a per-device keypair signs proofs on mutating requests, binding the session token to the device.

**Why:** Kiosk session tokens are long-lived and live on shared, physically exposed devices; DPoP makes an exfiltrated token useless elsewhere. An attended app using short-lived Cognito JWTs directly may not need this layer — decide per app in [AUTH-TEMPLATE.md](AUTH-TEMPLATE.md).

## D9 — Self-update via `/version.json` polling *(optional layer — take if the app runs unattended)*

**Decision:** The build bakes `__APP_BUILD_ID__`; running devices poll `/version.json` while idle and self-reload on mismatch, with reloads capped per build id (`lib/appUpdate.js`). Never auto-reload while an operator is mid-interaction (the kiosk suppresses it while modals are open).

**Why:** D1 means deploys don't restart running WebViews; unattended devices would run stale builds forever. Attended apps where humans refresh can skip this.

## D10 — Cloudflare Workers static hosting, dashboard Git integration

**Decision:** Hosting is Cloudflare Workers static assets, deployed by Cloudflare's Git integration on merge to `main`. No deploy workflow in the repo.

**Why:** Zero-maintenance deploys. The trade-off is that deploy config lives in the Cloudflare dashboard, not the repo — the kiosk documents it in `docs/deployment/` (note the project-naming caveat in `cloudflare-pages.md`). Mirror that doc in each new repo.

## D11 — Pure-logic extraction; thin component tests

**Decision:** Decision-shaped code lives in `src/lib/*.js` (framework-free) with Vitest tests beside it. Components stay thin and mostly untested.

**Why:** The bugs that matter (candidate selection, retry classification, credential policies) are pure functions — cheap to test exhaustively. Component tests are expensive and brittle; keeping logic out of components makes them not worth testing. This is also the JS-not-TS (D3) compensating control.

## D12 — Copy-per-app seeding; no shared package

**Decision (2026-07):** New apps copy the chassis files at seed time ([SEED-MANIFEST.md](SEED-MANIFEST.md)) and own them outright. No private npm package, no monorepo, no sync obligation.

**Why:** Sole developer, seeding for velocity; follow-up cross-app updates are expected to be rare-to-never. A package would add versioning/release ceremony to every chassis fix for near-zero benefit at n=3 apps. If a chassis fix matters everywhere, propagating it is deliberate and manual. Revisit if the team or app count grows.

## D13 — One error taxonomy per app

**Decision:** One API error class per app (kiosk: `KioskApiError`) with `code`/`status`/`details`/`retryAfter`; user-facing text only via `getUserFacingError`; permanent-vs-transient centralized in `retry.js`.

**Why:** Every retry loop, credential policy (D7), and UI message keys off the same classification. Scattered `err.message` checks were the failure mode this prevents.

## D14 — Kiosk-specific: never filter identify candidates on eligibility *(recorded for contrast)*

Kiosk-only invariant, **not** chassis: identify candidates are never filtered on `eligible_for_checkin` / `requires_review` (backend enforces its own gate at submit; confirmed with backend 2026-06). Recorded here as the model for how app-specific backend contracts should be documented in each new app: a dated confirmation, in code comments and CLAUDE.md, at the exact decision point.
