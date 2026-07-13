# Deployment — environments, promotion, and Cloudflare setup

> **Status:** Living reference · last verified 2026-07-11

One codebase, three live tiers in lockstep, promoted by branch (same model as
sentinel-ui's `docs/workflow/pr-workflow.md` — merge commits, **never
squash**):

```
feature branch ──PR──▶ develop ──PR──▶ staging ──PR──▶ main
                      (lint+unit)    (lint+unit+     (lint+unit+
                                      build:staging)  build)
                                          │               │
                                          ▼               ▼
                                   staging Worker    production Worker
                                   manage-staging.   manage.safepass.com
                                   safepass.com
```

- CI (`.github/workflows/ci-pr.yml`) gates every PR; `CI Gate` is the single
  required status check. PRs into `staging` build with the staging env; PRs
  into `main` build with production — a broken committed env file fails in
  CI, not on the Cloudflare build.
- Branch protection (set 2026-07-10): `develop`, `staging`, `main` all
  require `CI Gate` and forbid force-pushes/deletion. No required reviews
  (sole developer); merging `staging → main` stays a deliberate human act.

## Per-environment configuration

All client config is `VITE_*`, baked at build time. Committed files hold the
public values; **never a secret** (they ship in the bundle):

| File | Loaded by | Purpose |
|---|---|---|
| `.env.example` → local `.env` (gitignored) | `npm run dev` | Local dev; mode matrix documented in the file |
| `.env.staging` | `npm run build:staging` (`--mode staging`) | Staging API base, staging hostname callbacks |
| `.env.production` | `npm run build` (mode `production`) | Production values |

Real environment variables set in Cloudflare Workers Builds **override** the
committed files (Vite gives actual env highest priority) — use that for
values that shouldn't wait on a commit, keep the committed files as the
versioned source of truth.

Mock/dev toggles: `VITE_MANAGER_MOCK` (mock API) and `VITE_MODE=dev` (auth
bypass) are `false`/empty in both deploy tiers and remain fully functional
for local work.

## Cloudflare setup (dashboard — human-performed, mirrored here)

Two Workers projects off this one repo, both via **Workers Builds** GitHub
integration (note the kiosk's naming caveat: these are Workers static
assets, not legacy Pages):

| | Production | Staging |
|---|---|---|
| Worker name | `safepass-manager-app` | `safepass-manager-app-staging` |
| Production branch | `main` | `staging` |
| Build command | `npm run build` | `npm run build:staging` |
| Deploy command | default (`npx wrangler deploy`) | `npx wrangler deploy --env staging` |
| Custom domain | `manage.safepass.com` | `manage-staging.safepass.com` |

The staging Worker name/config comes from `wrangler.jsonc`'s
`env.staging` block (`CLOUDFLARE_ENV=staging` in the build script selects
it; verified: `dist/wrangler.json` carries the right name per mode).
PR preview deploys (non-production branches) are optional — enable on the
staging project if preview URLs are wanted per PR.

### First-deploy checklist

- [ ] Create both Workers projects with the settings above (DNS for the
      custom domains can follow; Workers serve on `*.workers.dev` until then)
- [x] **Staging app client** created on pool `us-gov-west-1_NKGtVs2Rq`:
      `4diu3cb4nnt78al45dv5r8iqu9`, wired in `.env.staging` (2026-07-11).
      `http://localhost:5273/*` callbacks verified registered — staging-pool
      testing from local dev works today.
- [ ] Confirm the staging web hostname (docs assume
      `manage-staging.safepass.com`) and register
      `https://<staging-host>/auth/callback` + `/auth/logout` on the staging
      client — probe shows it is NOT registered yet
- [ ] Register production callbacks on client `5grgviekbiv44ab9llnsdqnp55`
      (string-matched, no DNS needed):
      `https://manage.safepass.com/auth/callback` + `/auth/logout`
- [ ] Backend CORS: allow the two hosted origins (and `http://localhost:5273`
      for dev) on the staging (`safepass-api.forgearray.dev`) and production
      DataManager
- [ ] Backend audience switch per environment (backend team): the app-client
      authorization gate rejects this client's tokens (401 on whoami) until
      `COGNITO_MANAGER_AUDIENCE` is set — `4diu3cb4nnt78al45dv5r8iqu9` on
      staging, `5grgviekbiv44ab9llnsdqnp55` on production
- [ ] After first staging deploy: sign in end-to-end on the staging URL

## Release flow (day to day)

1. Feature branches PR into `develop`; merge on green `CI Gate` (merge
   commit).
2. When accumulated work is worth a release: open **`develop → staging`**
   PR (head = develop). Merge → Cloudflare auto-builds/deploys staging → QA
   on `manage-staging.safepass.com`.
3. Promote: **`staging → main`** PR. Merge → production deploy. Merging to
   `main` is a deliberate, human decision.
4. Running sessions pick the new build up via `/version.json` self-update
   polling (attended app left open all day; reloads never fire
   mid-interaction).

Rollback = revert the merge commit on the affected branch (never
force-push); Cloudflare redeploys the reverted state.
