# Haptics — map & implementation (SafePass Manager)

> **Status:** IMPLEMENTED 2026-07-23 (surfaces below marked ✅). Pure client
> wiring through the existing `src/lib/native/haptics.js` seam — no backend,
> no new deps. Scope confirmed in `docs/native-feature-schedule.md`.

## Seam & platform behavior
`src/lib/native/haptics.js`: `tapLight/Medium/Heavy`, `notifySuccess/Warning/
Error`. Lazy-imports `@capacitor/haptics`; **no-ops on web** (tests/dev safe);
**iPad silently ignores** (no Taptic Engine); full effect on **iPhone**.

## The map (as implemented)
Principle: fire on **outcomes and confirmations, not every tap.**

| Surface | Haptic | Where | |
|---|---|---|---|
| Check-in accepted (202) | `tapMedium` | `VisitorDetail.checkIn` success | ✅ |
| Check-in gate fail (review / already-in / no-badges / …) | `notifyWarning` | `VisitorDetail.checkIn` catch via **`lib/checkinGate.js`** (`isCheckinGateError`, unit-tested — gate codes are expected outcomes, not errors) | ✅ |
| Check-in real error | `notifyError` | same catch, non-gate codes | ✅ |
| Badge encoded ready ("check-in complete") | `notifySuccess` | `VisitsList` poll via **`lib/badgePipeline.js`** (see note) | ✅ |
| Visit confirm / checkout — success | `notifySuccess` | `VisitsList.act` factory | ✅ |
| Cancel visit — done | `notifyWarning` | `VisitsList.act(cancel)` (destructive-but-intended) | ✅ |
| Visit action error | `notifyError` | `VisitsList.act` catch | ✅ |
| Visitor create / update — saved | `notifySuccess` | `VisitorFormModal.submit` | ✅ |
| Visitor save error | `notifyError` | `VisitorFormModal.submit` catch | ✅ |
| Assign / rerender badge | `notifySuccess` | **NOT WIREABLE YET** — no UI exists for these actions (managerApi stubs only). Wire when the badge-actions surface is built. | ⏳ |
| Photo uploaded | `notifySuccess` | **NOT WIREABLE YET** — photo-upload flow is Phase 5. | ⏳ |
| Modal confirm press (any ConfirmModal) | `tapLight` | `components/ConfirmModal.jsx` — central, dated divergence from the sentinel-ui port (owner feedback 2026-07-23) | ✅ |
| Visitor form submit press | `tapLight` | `VisitorFormModal.submit` (before the async; outcome buzz follows) | ✅ |
| Add visitor button | `tapLight` | `VisitorsList` header button | ✅ |
| Visit action modal button press | `tapLight` | `pages/visits/VisitActionModal.jsx` (row-tap modal; outcome buzz from the action) | ✅ |

## Implementation notes (the two non-obvious bits)
- **Badge completion is a poll TRANSITION, not a callback.** The pipeline
  completes in the background (observed via the 15s list poll), so
  `lib/badgePipeline.js` (unit-tested) tracks the previous poll's statuses and
  reports ids that newly became `encoded_ready`; `VisitsList` buzzes Success
  once per transition. First page load stays silent by contract, and
  `useScopedPolling` pauses when hidden, so no background buzzing.
- **Gate-vs-error needs the RFC7807 code.** `lib/checkinGate.js` owns the
  brief-§4 gate-code set so the check-in catch can branch Warning vs Error.

## Testing
- Unit: `badgePipeline.test.js`, `checkinGate.test.js`; the wrapper no-ops off-
  native so component tests are unaffected.
- Manual: physical **iPhone** (simulator/iPad won't buzz).
