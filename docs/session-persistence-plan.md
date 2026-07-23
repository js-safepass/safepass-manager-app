# Session persistence — plan of record + Tier-1 work plan

> **Status:** **Tier 1 BUILT 2026-07-23** (both apps; device pass pending —
> see Phase E acceptance below). Tiers 2–3 remain planned.
> Originally: SCOPED 2026-07-23, greenlit same day. Revision of the
> tiered plan after review: **Tier 0 (login notice) is DROPPED** — Tier 1 makes
> it dead code (no Login page on update) — and the **pre-reload notice moves
> INTO Tier 1** (non-blocking "Updating…" toast, cancel-on-interaction).
> Owner is verifying refresh-token lifetimes on both Cognito app clients in
> parallel (the security backstop knob; recommendation 12–24h).
>
> **End goal (unchanged):** Tier 2 adds an OS-enforced biometric gate
> (SecAccessControl / BiometricPrompt+CryptoObject) to the SAME stored item;
> Tier 3 adds grace window + optional Face ID toggle. Nothing in Tier 1 is
> throwaway on that path.

## Storage decision (made, evidence-based)
**Port fleet-owned native code; no third-party plugin for credential custody.**
Kiosk's `ios/App/App/SecureStoragePlugin.swift` is 118 lines, proven in the
shipped App Store app: 3 methods (`set`/`get`/`remove`), Keychain with
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, registered via
`packageClassList`, with a ready JS wrapper (`src/lib/secureStorage.js`).
Android gets the same 3-method surface in ~100 lines of Kotlin using a
**Keystore-backed AES-GCM helper directly** (androidx security-crypto /
EncryptedSharedPreferences is deprecated — rolling the small cipher keeps the
Tier-2 CryptoObject path natural). Owning both halves means Tier 2 is an
attribute change, not a migration, and no supply-chain dep guards the tokens.

## What is stored, when, and when it dies
- Stored (native only, never web): `{ refreshToken, storedAt }`. The ID/access
  tokens are NEVER persisted — restore always mints fresh ones via the
  existing refresh grant. Dev mode (`VITE_MODE=dev`) never persists.
- Persist on: sign-in; refresh-token ROTATION (re-persist inside freshToken's
  commit hook so a rotated token is never lost).
- Wipe on: explicit sign-out (`sessionCleanup` hook), terminal codes
  (`USER_ACCOUNT_INACTIVE`), **definitive** refresh failure (`invalid_grant`
  etc. via the existing `isDefinitiveRefreshFailure`), corrupt/unreadable data.
- Boot restore: stored token → refresh grant → in-memory tokens → signed in.
  TRANSIENT failure at boot (bridge blip, offline): show Login but KEEP the
  stored token — the next cold start retries. Definitive failure: wipe → Login.
- New auth status `'restoring'` (native, stored-token-present only) renders a
  brief splash instead of flashing the Login screen.

## Tier-1 work breakdown (~10–12h manager, ~3h mapping)

### Phase A — native secure-storage plugin, manager (~3–4h)
- A1 (~0.5h): Port `SecureStoragePlugin.swift` → `ios/App/App/`, add to
  `packageClassList` (kiosk registration pattern, proven).
- A2 (~1.5–2h): `SecureStoragePlugin.kt` — same 3-method API; Keystore
  AES-GCM encrypt/decrypt to app-private storage; register in `MainActivity`.
- A3 (~0.5h): Re-port `src/lib/secureStorage.js` wrapper (lazy, guarded,
  no-op on web — the deleted Phase-0 file, resurrected per D12).
- A4 (~0.5h): `cap sync` + debug builds on both platforms.

### Phase B — manager restore path (~4–5h)
- B1 (~1.5h): `src/lib/sessionPersistence.js` (pure, unit-tested): payload
  shape/validation + the restore/wipe decision table above.
- B2 (~2–2.5h): `AuthContext` wiring — persist on sign-in & rotation; wipe on
  sign-out/terminal/definitive-failure; boot path (stored token → grant →
  `signIn`) behind the new `'restoring'` status; extend `AuthContext.test.jsx`.
- B3 (~0.5h): `App.jsx` splash for `'restoring'`.

### Phase C — pre-reload update notice, manager (~1–1.5h)
- C1: Use `checkForDeployedUpdate({ reload })`'s existing injectable: replace
  the raw reload with notice-then-reload — flash/toast "Updating SafePass…",
  ~5s timer, **cancelled (deferred to next safe check) by any user
  interaction**, then reload. No appUpdate.js changes; policy stays gated as
  shipped. Post-restore the user lands back via `returnPath` with the session
  intact — the update reads as a blink, not a logout.

### Phase D — mapping, copy-per-app (~2.5–3h)
- D1 (~0.75h): Copy both native plugin files + registration; `cap sync`.
- D2 (~0.5h): Copy `secureStorage.js` + `sessionPersistence.js` (mapping
  storage key).
- D3 (~1h): Mapping `AuthContext` wiring + `'restoring'` splash in `App.jsx`
  (same post-standardization shape as manager).
- D4 (~0.5h): `SelfUpdate` notice via the existing ToastProvider, same
  cancel-on-interaction defer.

### Phase E — verify + ship (~2h)
- E1: Both suites green; web no-op sanity (wrapper inert in browser).
- E2: **Rebuild all four debug APKs** (plugin = binary change) — staging +
  prod variants; this is the "free while sideloading" window.
- E3: Device pass: cold-start restore; update-reload restore (deploy a
  staging bump); explicit-logout wipe; definitive-failure wipe (revoke the
  test user's sessions); transient-failure keep (airplane-mode boot).
- E4: PRs → develop → staging per repo (release PRs pick up automatically);
  amend CLAUDE.md invariant 3 / build-plan decision #4 with the dated custody
  change (in the same PR as the code).

## Owner inputs — CONFIRMED 2026-07-23
| Input | Value (both apps' clients) | Consequence |
|---|---|---|
| Refresh token expiration | **5 days** (owner: fine) | Seamless for up to 5 days per login; expiry is fixed from login (not sliding), so worst case is one interactive login every 5 days — restore fails SOFT at the boundary (normal Login) |
| Access / ID token expiration | 15 minutes | already handled by freshToken silent refresh |
| Auth flow session duration | 5 minutes | hosted-UI flow window only; no impact on restore |
| Rotation | not reported — persist-on-rotation hook handles either | — |
| Greenlight | **GO** (2026-07-23) | building Phases A→E |

## Sequencing note
A → B → C ship together as one manager PR (custody change + notice, one
review). D is a follow-on mapping PR the same day. E3's device pass is the
real acceptance gate before the release PRs are human-merged.
