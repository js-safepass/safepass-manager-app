# SEED-MANIFEST — what to copy into a new app repo

> **Status:** Living reference · last verified 2026-07-10
> Files are copied **from the live kiosk repo at seed time** by [scripts/seed-new-app.sh](scripts/seed-new-app.sh) (that script is the executable version of this list — keep them in sync). Three grades:
>
> - **as-is** — copy, use, done (generic chassis code)
> - **adapt** — copy, then rename/trim per the notes; the structure and hard-won logic are the value
> - **reference** — don't copy verbatim; rebuild per-app using it as the model

## Tooling & config

| File | Grade | Notes |
|---|---|---|
| `scripts/test.sh` | as-is | Local CI mirror (diff-aware lint + tests + build) |
| `.github/workflows/ci-pr.yml` | adapt | Keep job names (`ci_gate` is the required check); adjust branch names only if the new repo's flow differs |
| `eslint.config.js` | as-is | Includes the intentional-empty-catch allowance for `lib/native/` |
| `vite.config.js` | adapt | Keep dual-build (`CAP_BUILD`) + `__APP_BUILD_ID__` define; Cloudflare plugin points at the new project |
| `vitest.setup.js` | as-is | |
| `.env.example` | adapt | Rewrite values per [AUTH-TEMPLATE.md](AUTH-TEMPLATE.md); keep the header comments explaining the `.env` policy |
| `capacitor.config.ts` | adapt | New `appId` (`com.safepass.<name>`), new `server.url`; **keep the explanatory comments** — they are the authoritative record of D1/D2 |
| `index.html` | adapt | Title/meta; keep the CSP-related structure |
| `package.json` | reference | Start fresh (`npm create vite`), then add the same dep families: React 19, Capacitor 8 core + needed plugins, Vitest/jsdom, ESLint flat config, Cloudflare Vite plugin |
| `.gitignore` | as-is | |

## `src/lib` — the chassis

| File | Grade | Notes |
|---|---|---|
| `platform.js` | as-is | Single source of platform truth |
| `pkce.js` | as-is | |
| `dpop.js` | as-is (Layer 2 only) | Skip entirely if the app doesn't take Layer 2 |
| `jwtUtil.js` | as-is | |
| `errorLog.js` | as-is | |
| `appUpdate.js` + `appUpdate.test.js` | as-is (unattended apps only) | See [D9](DECISIONS.md#d9) |
| `cognitoHostedUi.js` | adapt | Reads the `VITE_COGNITO_*` env surface; check for kiosk-named vars |
| `secureStorage.js` | as-is (Layer 2 only) | Pairs with the native plugin below |
| `kioskApi.js` + test | adapt | **Keep**: the error class (rename `KioskApiError` → `<Name>ApiError`), request core, DPoP-proof attachment (if Layer 2), mock-API pattern (`createMockKioskApi` + `VITE_*_MOCK`). **Replace**: every endpoint method with this app's permitted calls |
| `retry.js` + test | adapt | Only change: import of the renamed error class. Classification logic copies verbatim |
| `userErrors.js` + test | adapt | Keep `getUserFacingError(err, context)` shape and code→message mapping structure; rewrite the message catalogue for this app's flows |
| `kioskCredentials.js` | adapt (Layer 2 only) | Rename per app; keep the versioned-schema persist/restore pattern |
| `restoreFailurePolicy.js` + test | as-is (Layer 2 only) | Non-negotiable if persisting ([D7](DECISIONS.md#d7)) |
| `refreshFailurePolicy.js` + test | as-is (Layer 2 only) | |
| `nativeBridge.js` | reference | Only for shell-injected lockdown apps; probably neither new app |
| `lib/native/*` | as-is (pick) | Take only the wrappers for plugins the app uses; keep the lazy-import/no-op pattern for any new ones |

**Kiosk-only — never seed:** `candidateSelect.js`, `checkinFlow.js`, `cameraCapture.js`, `nativeUpload.js` (iOS-only S3 upload path), everything under `pages/components/checkin/`.

## App shell (`src/`)

| File | Grade | Notes |
|---|---|---|
| `main.jsx` | adapt | Keep: provider tree order, runtime CSP setup, browser gate (`VITE_BLOCK_BROWSER_ACCESS`) if the app should be native-only. Trim kiosk providers |
| `App.jsx` | reference | The state-router pattern (restore overlay → Login → app) transfers; the states are per-app |
| `state/AuthContext.jsx` + `state/useAuth.js` | adapt | OAuth mechanics + dev-bypass (`VITE_MODE=dev`) transfer; trim kiosk-session wiring and credential-wipe hooks unless Layer 2 |
| `state/NetworkContext.jsx` + test + `state/useNetwork.js` | as-is | Generic online/offline awareness |
| `state/KioskSessionContext.jsx` | reference (Layer 2 only) | Model for a device-session context |
| `pages/Login.jsx` | adapt | Hosted UI + PKCE + native deep-link flow transfers; restyle per app |
| `hooks/useKioskDisplay.js` | reference | Wake lock / fullscreen / orientation — only for kiosk-style display control |

## Native shells (`ios/`, `android/`)

| Item | Grade | Notes |
|---|---|---|
| Shell projects | reference | Generate fresh with `npx cap add ios/android` for the new `appId`; do not copy the kiosk's shells |
| SecureStorage plugin (Swift + Kotlin) | adapt (Layer 2 only) | Copy the plugin source into the fresh shells; it's deliberately in-repo ([D6](DECISIONS.md#d6)) |
| `ios/scripts/select-server-url.sh` | as-is | `CAP_SERVER_URL` Debug/Release wiring |
| Deep-link registration | reference | New scheme per app; iOS URL type + Android intent filter |

## Docs

| Item | Grade | Notes |
|---|---|---|
| `docs/README.md` | adapt | Start the new repo's doc index with the same status-header regime |
| `docs/deployment/` | adapt | Rewrite for the new Cloudflare project; keep the structure and the naming caveat |
| `handoff/CLAUDE-TEMPLATE.md` | adapt | Becomes the new repo's `CLAUDE.md` — fill the blanks |
