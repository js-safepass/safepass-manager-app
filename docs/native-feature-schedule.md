# Native feature schedule (PROPOSED) — SafePass Manager

> ⚠️ **Nothing here is built or greenlit.** This is a pitch/approval artifact.
> Each item is a *candidate* native integration that (a) strengthens the App
> Store Guideline 4.2 "genuinely native, not a web wrapper" case and (b) adds
> real product value. **Do not implement any of these without explicit
> sign-off.** Effort is in effort-days (sole-dev convention), excludes review.

Context: manager stays live-web-view, so its 4.2 defense comes from native depth.
An audit (2026-07-22) found **zero** native capability wired today. The browser
gate (shipped) + these features are the depth story. See
`docs/native-app-store-plan.md`.

| # | Feature | Product value | 4.2 weight | Effort | Dependencies |
|---|---|---|---|---|---|
| 1 | **Haptics** on key actions | Tactile confirm on check-in success + primary actions | Low–Med | ~0.5 d | none — `@capacitor/haptics` + wrapper already present, just unused |
| 2 | **Camera** — visitor photos | Capture visitor photo at check-in / enrollment | **High** (visible native hardware use) | ~2–3 d | the visitor-photo capture UI flow (build-plan Phase 5) must exist; `@capacitor/camera` + `NSCameraUsageDescription` already present |
| 3 | **Push notifications** | Real-time alerts (visitor arrival, check-in events, review needed) | **High** | ~3–5 d + backend | `@capacitor/push-notifications` (not installed), APNs key + FCM, backend token registration + send infra |

### Suggested sequence (if greenlit)
1. **Haptics** — cheapest, ship anytime, immediate polish.
2. **Camera** — pair with building the visitor-photo capture feature (real product
   milestone + the strongest single 4.2 signal manager can add).
3. **Push** — largest lift; needs backend/APNs work; schedule as its own project.

### Notes
- Each is independently shippable; none blocks the others.
- Camera is the highest value-per-effort once the photo flow exists — it's both a
  real feature and hardware-level native depth a reviewer can see.
- Push is the biggest 4.2 signal but the heaviest lift (backend + Apple/Google
  push infra) — treat as a standalone initiative, not a quick add.

## Scoped surfaces (confirmed 2026-07-23)

### Haptics — native only; iPhone (no-op on iPad/web)
Principle: fire on **outcomes and confirmations, not every tap**.

| Surface | Haptic |
|---|---|
| Check-in accepted (202) | Medium impact |
| Check-in complete (badge encoded ready) | Success |
| Check-in gate fail (428 review / 409 already-in / no-badges) | Warning |
| Visit confirm / checkout / complete — success | Success |
| Cancel visit — confirm tap → done | Medium impact → Warning |
| Assign / rerender badge — success | Success |
| Visitor create/update saved | Success |
| Photo uploaded | Success |
| Any mutation error (`ManagerApiError`) | Error |

### Push notifications — requires push infra (`@capacitor/push-notifications` + APNs/FCM + backend)
| Event | Push? | Priority | Recipient |
|---|---|---|---|
| `geofence_breach` | ✅ | High | front-desk staff |
| `checkin_failed` | ✅ | High | front-desk staff |
| `review_required` | ✅ | Normal | front-desk staff |
| `device_offline` | ✅ | Normal | front-desk staff |
| **Host notification** — visitor arrival | ✅ | Normal | **the host** ‹confirm host push channel — hosts may not be manager-app users; backend routing decision› |
| `visitor_checked_in` (staff feed) | ✗ in-app only | — | front-desk |
| `visit_completed` | ✗ in-app only | — | — |
