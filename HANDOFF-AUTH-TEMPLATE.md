# AUTH-TEMPLATE — wiring a new app into SafePass auth

> **Status:** Living reference · last verified 2026-07-10
> The auth stack has two layers. **Layer 1 is mandatory** for every app. **Layer 2 is opt-in** for apps that hold long-lived device sessions (kiosk-style). Decide per app before seeding.

## Layer 1 — Cognito Hosted UI + PKCE (every app)

**Flow:** app → `buildAuthorizeUrl()` (`lib/cognitoHostedUi.js`) → Hosted UI at `https://auth.safepass.com` → redirect back with `code` → `exchangeCodeForToken()` with the PKCE verifier → Cognito JWTs. On native, the Hosted UI opens in an in-app browser and the redirect is a custom-scheme deep link.

**Shared, do not change:**
- Bridge domain `https://auth.safepass.com` — never the raw `*.amazoncognito.com` endpoint (GovCloud has no native custom-domain support; see [DECISIONS.md D4](DECISIONS.md#d4--auth-bridge-domain-never-raw-cognito)).
- User pool: `us-gov-west-1_jpRl7DoR5`.
- PKCE implementation: `lib/pkce.js` (copy as-is).
- Token handling on web: **in-memory only** ([D6](DECISIONS.md#d6)).

**Per-app (Cognito console + env):**

1. Create a dedicated app client in the pool (public client, no secret, authorization-code grant + PKCE).
2. Register callback/logout URLs on that client — all of:
   - `http://localhost:5173/auth/callback` + `/auth/logout` (dev)
   - `https://<name>.safepass.com/auth/callback` + `/auth/logout` (web)
   - `safepass<name>://localhost/auth/callback` + `/auth/logout` (native deep link)
3. Ensure the `auth.safepass.com` bridge passes the new client through (it fronts the pool; verify nothing on the bridge allowlists client IDs or redirect hosts).
4. Scope the client's tokens to the API calls this app is permitted — the backend authorizes per-JWT; keep the client minimal.
5. Register the deep-link scheme in the native shells (iOS: URL type in Xcode; Android: intent filter) — this is one of the few changes that **requires a native rebuild** ([D1](DECISIONS.md#d1)).

**Env block** (goes in `.env.example`, values per environment):

```bash
VITE_COGNITO_DOMAIN=https://auth.safepass.com
VITE_COGNITO_CLIENT_ID=<this app's client id>
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_COGNITO_LOGOUT_URI=http://localhost:5173/auth/logout
# Native deep-link callbacks (Capacitor shell):
# VITE_COGNITO_NATIVE_REDIRECT_URI=safepass<name>://localhost/auth/callback
# VITE_COGNITO_NATIVE_LOGOUT_URI=safepass<name>://localhost/auth/logout
VITE_<NAME>_API_BASE=https://api.safepass.com
```

**Code to seed** (see [SEED-MANIFEST.md](SEED-MANIFEST.md)): `lib/pkce.js`, `lib/cognitoHostedUi.js`, `lib/jwtUtil.js`, `state/AuthContext.jsx` + `state/useAuth.js`, `pages/Login.jsx`. AuthContext/Login carry some kiosk assumptions to trim (kiosk-session wiring, credential wipe hooks); the OAuth mechanics transfer intact.

## Layer 2 — Device sessions: DPoP + secure persistence (opt-in)

Take this layer only if the app runs **unattended or on shared devices** and needs a session that outlives Cognito token lifetimes and cold starts. The kiosk needs it; an attended app where a human logs in each day likely does not.

| Piece | File(s) | What it does |
|---|---|---|
| DPoP proofs | `lib/dpop.js` | Per-device keypair; signs proofs on mutating requests so the session token is useless off-device ([D8](DECISIONS.md#d8)) |
| Secure persistence | `lib/secureStorage.js` + the custom native SecureStorage plugin (`ios/`, `android/`) | Keystore-backed storage; in-repo plugin, no community dep ([D6](DECISIONS.md#d6)) |
| Credential schema | `lib/kioskCredentials.js` (rename per app) | Versioned persist/restore of keypair + session token (schema v3 pattern) |
| Failure policies | `lib/restoreFailurePolicy.js`, `lib/refreshFailurePolicy.js` | Transient failures **never** wipe the keystore ([D7](DECISIONS.md#d7)) — non-negotiable if you persist |

If you take Layer 2, also take the session-exchange call shape from `lib/kioskApi.js` (Cognito JWT → device session) and coordinate a per-app session endpoint with the backend.

If you skip Layer 2: authenticate API calls with the Cognito access token as a plain bearer, keep tokens in memory, and re-run Layer 1 on refresh failure/expiry. Skip `dpop.js`, `secureStorage.js`, credentials, and both failure policies entirely.

## Per-app worksheet

| Item | App A — Management | App B — Site config |
|---|---|---|
| App client ID | `5grgviekbiv44ab9llnsdqnp55` (2026-07-10) | *(create)* |
| Hostname | `manage.safepass.com` | *(e.g. `siteconfig.safepass.com`)* |
| Deep-link scheme | `safepassmanager://` | *(e.g. `safepasssiteconfig://`)* |
| Layer 2? | **no** (attended, personal login; DPoP planned via managerApi `attachProof` seam when backend supports it) | likely **no** — confirm |
| Self-update polling ([D9](DECISIONS.md#d9))? | **yes** — staff tablets/PCs sit open all day | only if left running unattended |

Fill this in as the values are provisioned, and copy the filled row into the new repo's CLAUDE.md.
