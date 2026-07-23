# Native app + App Store plan — SafePass Manager

> **Status:** decisions captured 2026-07-22; **not yet implemented.** Targets: public
> Apple App Store + Google Play. This doc exists so we don't re-derive this path.

## The problem we're designing against (Apple Guideline 4.2)
Every SafePass app loads a hosted URL in a WebView (Capacitor `server.url`). On the
**public** App Store that's the exact shape Apple scrutinizes under **Guideline 4.2**
("this is just a website you could visit in Safari — minimum functionality"). The
**kiosk app already fought and won a 4.2 review** — reusable precedent lives in
`safepass-kiosk-web/docs/app-store-submission/dispute-prep.md`. It won on: native
depth + native OAuth + a browser-access gate + B2B framing.

Manager is thinner than kiosk, so it needs a deliberate native-depth story.

## Decisions

### Architecture — stay live-web-view (do NOT bundle)
Keep `server.url` (hosted origin) so web updates ship without an App Store resubmit.
Manager will keep evolving (native-depth roadmap below), so instant updates matter.
Its 4.2 defense comes from **native depth**, not bundling. (Contrast: the mapping app
IS bundling — different tradeoff, see its plan; it changes least so it tolerates slow
updates, and it needs bundling because it has almost no native depth.)

### Auth — in-place OAuth + `allowNavigation` (the proven mapping method)  ← APPLIED 2026-07-22
**Was broken; now fixed.** Native sign-in opened the Cognito redirect in the EXTERNAL
browser (login completed there and stranded) because manager used the in-place
`window.location.assign` model but lacked `server.allowNavigation`. **Fix applied:** added
`allowNavigation` for the auth hosts (`auth.safepass.com`, the staging FIPS Cognito domain,
`*.amazoncognito.com`) to `capacitor.config.ts` — the exact config the mapping app already
proves on Android. Capacitor now keeps the Cognito login (and its redirect back to the app
origin) INSIDE the WebView. No custom scheme, no in-app browser, and **no backend change**
(reuses the existing `<origin>/auth/callback`, already a registered web callback).

**Decision (2026-07-22):** use this simple, proven, live-web-view method for BOTH apps for
now — smallest fix, no backend work. Still verify on a real iOS device (WKWebView is fussier
than Android's Chromium; the in-WebView flow works there in principle but isn't device-tested).

#### Pivot option (documented, NOT active) — port kiosk's Browser + custom-scheme OAuth
If App Store 4.2 review pushes back on in-WebView auth, or if we ever bundle, switch to
kiosk's pattern: `@capacitor/browser` (SFSafariViewController) + custom scheme
`safepassmanager://` + `@capacitor/app` `appUrlOpen` + scheme registration in the native
projects. Deps + `VITE_COGNITO_NATIVE_REDIRECT_URI=safepassmanager://…` are already present,
so the pivot is mostly wiring `Login.jsx` + registering the scheme; it also needs the Cognito
client to allow `safepassmanager://localhost/auth/callback` (backend). Kiosk uses this pattern
deliberately as part of its 4.2 defense (Apple's blessed OAuth surface) — see
`safepass-kiosk-web/docs/app-store-submission/dispute-prep.md`.

### Native-depth roadmap (compounds the 4.2 defense over time)
- **Now:** native OAuth (above).
- **Soon:** Camera for visitor photos (`@capacitor/camera` + `NSCameraUsageDescription`
  already in place).
- **Later:** Push notifications.
These are real features *and* 4.2 evidence — roughly kiosk's winning recipe.

### Device target — universal (iPhone + iPad) is fine
Manager is a front-desk tool; iPad is plausible. Revisit only if an iPad-specific
issue surfaces. (Mapping goes iPhone-first — different rationale, see its plan.)

### Reviewer access
Login-gated; MFA is pool-enforced (currently temporarily disabled — provide the demo
user's TOTP seed via the store console when re-enabled, never in the repo). Real
check-in/out isn't completable in a demo org → reviewer notes + optional demo video.
See `store/app-review-access.md`.

## Open items (to prioritize)
- [x] Fix native sign-in — `allowNavigation` added (2026-07-22)
- [ ] Verify sign-in end-to-end on a real iOS device + Android (WKWebView especially)
- [ ] **Native depth for 4.2** (the focus now): iOS Privacy Manifest, haptics, camera
  (visitor photos), push notifications, browser-access gate — see the fleet integration plan
- [ ] *(pivot only, if 4.2 pushes back)* port kiosk Browser+scheme OAuth + register
  `safepassmanager://` + Cognito callback
