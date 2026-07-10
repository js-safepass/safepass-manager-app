# KNOWN-ISSUES — traps, open items, and things that look wrong but aren't

> **Status:** Living reference · last verified 2026-07-10

## Traps a new app will hit

- **CapacitorHttp + `server.url`**: enabling CapacitorHttp rewrites GET URLs to the server host and silently breaks API calls. It stays disabled ([D2](DECISIONS.md#d2)). Old docs/comments describing the `capacitor://` + CapacitorHttp + base64-upload architecture are **superseded** — do not resurrect it.
- **Raw Cognito endpoint**: `*.amazoncognito.com` must never appear in any config; always the `auth.safepass.com` bridge ([D4](DECISIONS.md#d4)). GovCloud Cognito has no native custom-domain support, which is *why* the bridge exists.
- **`VITE_*` vars are public**: baked into the client bundle at build time. Never a secret.
- **Dual build confusion**: `npm run build` includes the Cloudflare Vite plugin; the Capacitor static build is `npm run cap:build` (`CAP_BUILD=true`). Syncing the wrong build into the shell produces confusing artifacts.
- **Cloudflare project naming**: there's a naming caveat in the kiosk's `docs/deployment/cloudflare-pages.md` (Workers static assets vs. legacy Pages naming) — read it before creating the new Cloudflare project.
- **Deep-link scheme changes need a native rebuild**: almost everything ships via web deploy ([D1](DECISIONS.md#d1)), but OAuth callback schemes, plugins, and shell code do not. The kiosk's `docs/native-app-change-impact-map.md` is the reference for reasoning about this.
- **Auto-reload during interaction**: if you take the self-update layer ([D9](DECISIONS.md#d9)), suppress reloads while any modal/flow is open — the kiosk had to add this (`fe625a1`).
- **Version probe hangs**: bound any `/version.json`-style fetch with an AbortController timeout — the kiosk uses 8s (`07c5d3d`); an unbounded fetch can wedge the idle loop.

## Open items in the kiosk (state at handoff, 2026-07)

- **DPoP `htu` canonicalization tests** — item 6 of `docs/security-hardening-plan.md`, still open. If a new app takes Layer 2 (DPoP), inherit this gap knowingly or close it there first.
- **Android/Play effort in progress** (`feat/android-play-phase1`+): custom Kotlin secure-storage plugin, standard Play app (no MDM/COSU). iOS is live; Android is not yet. New apps starting both platforms fresh don't carry the "iOS is live, don't regress" asymmetry — but will develop their own equivalent once first-live.
- **`window.SafePassNative` bridge**: iOS side implemented; Android section + event consumption still plan (`docs/kiosk-web-app-communication-plan.md`). Only relevant to apps needing shell-injected lockdown (Guided Access / Lock Task) — probably neither new app.
- **Key-light feature** (`docs/key-light/`): awaiting go/no-go; kiosk-only.

## Things that look wrong but aren't

- **Empty `catch {}` in `lib/native/*`**: intentional — wrappers no-op on web. Lint-allowed.
- **Thin component test coverage**: by design ([D11](DECISIONS.md#d11)); the logic lives in tested `lib/` modules.
- **`typescript` in devDependencies of a no-TS repo**: needed for `capacitor.config.ts` and editor types only ([D3](DECISIONS.md#d3)).
- **Committed `.env.production`**: holds public client-side config only; secrets never enter `VITE_*`.
- **`ios/`/`android/` committed but lint-ignored**: Capacitor shells are source, not build output, but they're not JS-lint targets.
- **Kiosk-only oddities** (don't cargo-cult into new apps): candidate filtering restricted to `archived`/`rejected` with the multi-match picker hard-disabled — that's a backend-confirmed kiosk contract ([D14](DECISIONS.md#d14)), not a chassis pattern.

## Process gotchas

- CI's `ci_gate` is the single required check; branch protection targets it, so renaming jobs breaks the gate silently — keep the job name.
- CI does not build native. Xcode/Gradle validation is local-only; budget for it when touching shells.
- `docs/notes.md` (kiosk) is a human-only scratchpad whose header forbids automated edits — the pattern may recur in new repos; respect such headers.
