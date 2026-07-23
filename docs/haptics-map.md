# Haptics — map & implementation plan (SafePass Manager)

> **Status:** PLAN, not yet implemented (2026-07-23). Pure client wiring — no
> backend, no new deps. Surfaces confirmed in `docs/native-feature-schedule.md`.

## Ready-made seam
`src/lib/native/haptics.js` already exists (unused) and is the single seam:
`tapLight` / `tapMedium` / `tapHeavy`, `notifySuccess` / `notifyWarning` /
`notifyError`. It lazy-imports `@capacitor/haptics` and **no-ops on web**.

## Platform behavior (no extra code needed)
- **Web / dev / mock:** no-op (the wrapper guards on `isNative`) — tests are safe.
- **iPad:** the OS silently ignores haptics (no Taptic Engine) — automatic no-op.
- **iPhone:** full effect. Manager is universal, so haptics land only on iPhone.

## The map
Principle: fire on **outcomes and confirmations, not every tap.**

| Surface | Wrapper call | Where (call site) |
|---|---|---|
| Check-in accepted (202) | `tapMedium` | `pages/visitors/VisitorDetail.jsx` — check-in handler |
| Check-in complete (badge encoded ready) | `notifySuccess` | badge-pipeline completion (`useVisitFlow` / badge status poll) |
| Check-in gate fail (428 review / 409 already-in / no-badges) | `notifyWarning` | check-in handler `catch` |
| Visit confirm / checkout / complete — success | `notifySuccess` | visit lifecycle actions (`VisitsList` / visit detail — confirm at wiring) |
| Cancel visit — confirm tap → done | `tapMedium` → `notifyWarning` | ConfirmModal confirm + action result |
| Assign / rerender badge — success | `notifySuccess` | badge action handler |
| Visitor create / update — saved | `notifySuccess` | `pages/visitors/VisitorFormModal.jsx` |
| Photo uploaded | `notifySuccess` | photo upload handler |
| Any mutation error (`ManagerApiError`) | `notifyError` | action `catch` blocks |

## Implementation approach
- Import the wrapper fns at each handler; call on the mutation's `then`/`catch`.
- Keep it explicit per surface (the seam doesn't know success *semantics*).
  Optionally a tiny `withHaptic(action, {success, error})` helper if the `catch`
  duplication grows — but don't route through the `managerApi` seam (it can't
  tell a "check-in" success from a "cancel" success).
- No new wrapper functions needed; the six cover every surface above.

## Testing
- Unit: the wrapper already no-ops off-native, so jsdom tests are unaffected. If
  desired, assert the right wrapper fn is called by mocking `lib/native/haptics`.
- Manual: verify on a physical **iPhone** (simulator + iPad won't buzz).

## Effort
~0.5 day (wiring only). No backend, no store review impact beyond being a small
native-depth signal.
