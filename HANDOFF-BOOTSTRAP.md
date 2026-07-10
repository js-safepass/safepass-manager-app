# BOOTSTRAP — agent procedure for spinning up a new SafePass app

> **Status:** Living reference · last verified 2026-07-10
> You are an agent in a fresh (or freshly seeded) repository, building a new SafePass client app. This bundle was seeded from `safepass-kiosk-web`, the reference implementation. Follow this procedure; don't re-derive decisions that are already made.

## Read first, in order

1. `HANDOFF-STANDARDS.md` — the stack and conventions you must follow
2. `HANDOFF-DECISIONS.md` — why; includes what NOT to do (D2's superseded architecture, D4's raw-endpoint ban)
3. `HANDOFF-AUTH-TEMPLATE.md` — the auth recipe; check the per-app worksheet for this app's values
4. `HANDOFF-KNOWN-ISSUES.md` — traps you will otherwise hit

(If you're reading this inside the kiosk repo, the files are `handoff/STANDARDS.md` etc.)

## Inputs you need from the human

Before wiring auth or deploy, you need (partial progress is fine without them — use mock mode):

- App name/slug, hostname, and one-line purpose
- Cognito app client ID for this app (dedicated client, same pool — creation checklist in AUTH-TEMPLATE)
- Layer 2 decision: does this app hold long-lived device sessions? (Default for attended apps: **no**)
- Self-update decision (D9): does it run unattended? (Default: **no**)
- The API surface this app's JWTs permit (drives the API module and mock)

If any are missing, proceed with placeholders + mock API and list them as blockers at the end.

## Procedure

### 1. Skeleton

- `npm create vite@latest . -- --template react` (JS template — **no TypeScript**, D3), align React to 19.
- Add dependency families per SEED-MANIFEST's `package.json` notes: Capacitor 8 core, Vitest + jsdom, ESLint flat config, Cloudflare Vite plugin.
- Verify the seeded files are in place (if the human ran `seed-new-app.sh`, chassis files preserving their kiosk paths are already here). Delete any seeded `(Layer 2 only)` files this app doesn't need — SEED-MANIFEST grades every file.

### 2. Identity pass

Sweep the seeded files for kiosk identity and rename:

- `KioskApiError` → `<Name>ApiError` (and the `retry.js` import)
- `kioskApi.js` → `<name>Api.js`: keep the request core + error class + mock pattern; **delete every kiosk endpoint** and stub this app's permitted calls
- `userErrors.js`: keep the `getUserFacingError` shape; rewrite the catalogue as flows get built
- `.env.example`: rewrite per AUTH-TEMPLATE's env block
- `capacitor.config.ts`: new `appId`, new `server.url`, keep the explanatory comments
- `CLAUDE-TEMPLATE.md` → `CLAUDE.md` at repo root: fill every `{{PLACEHOLDER}}`, delete inapplicable Layer-2 lines

### 3. Running app, mock-first

- Provider tree in `main.jsx` (Auth → Network → app), minimal `App.jsx` state router: Login → main screen.
- Wire the mock API mode (`VITE_*_MOCK=true`) so the app is fully drivable with no backend.
- `./scripts/test.sh` must pass (lint + tests + build) before anything else lands. Seeded lib tests should pass unmodified except for renames.

### 4. Auth wiring (needs the app client ID)

- Follow AUTH-TEMPLATE Layer 1 exactly: `pkce.js` + `cognitoHostedUi.js` + `AuthContext` + `Login.jsx`.
- Dev flow first (`localhost:5173` callback), then hosted. Keep the `VITE_MODE=dev` auth bypass for local velocity.
- Layer 2 only if the worksheet says so.

### 5. Native shells (can be deferred — web ships value alone)

- `npx cap add ios && npx cap add android` with the new `appId`; do **not** copy the kiosk's shells.
- Set `server.url`, register the deep-link scheme (iOS URL type, Android intent filter).
- If Layer 2: port the in-repo SecureStorage plugin sources from the kiosk shells.

### 6. Repo & process

- Branches: create `develop` and `staging`; PR flow per STANDARDS. `ci-pr.yml` seeded — keep the `ci_gate` job name (required check).
- Start `docs/README.md` with the status-header regime; first living doc: `docs/deployment/` for the new Cloudflare project (human creates the CF project — note the naming caveat in KNOWN-ISSUES).

## Guardrails (violating these is a bug, not a preference)

- No TypeScript files. No CapacitorHttp. No raw `*.amazoncognito.com`. No secrets in `VITE_*`. No tokens in web storage.
- Decision-shaped code goes in `src/lib/*.js` with a test beside it — not in components.
- If you persist credentials (Layer 2): transient failures never wipe the keystore.
- Preserve "why" comments; add dated confirmations when the backend confirms a contract.
- When something here conflicts with what you find in the kiosk repo's code, the **kiosk code wins** — then flag the discrepancy so the bundle gets fixed.

## Done means

- `./scripts/test.sh` green; app runs against mock with no backend; auth round-trips in dev; `CLAUDE.md` has no `{{PLACEHOLDER}}` left; blockers (missing inputs, CF project, app client) listed explicitly for the human.
