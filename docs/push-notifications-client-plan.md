# Push notifications — client plan (SafePass Manager)

> **Status:** PLAN, not started (2026-07-23). Client half of the backend
> **Phase 9** (`sentinel-datamanager/docs/notifications/phase9-push-notifications.md`).
> Push is a **manager-only** feature (mapping = N/A). Needs greenlight + the
> backend work + a push transport decision (Phase 9 decision #1) before build.

## Principle (settled)
Notification **subscription** preferences are **central** — the backend already
owns per-user/per-org/per-type channel prefs, and push is just a new channel
value there. The app is a **client** of those prefs; it does **not** store
subscription state locally. Local storage is for **presentation only**.

## Client work
1. **Device registration** (native only)
   - On native sign-in: request permission + register via
     `@capacitor/push-notifications`; on the `registration` token, `POST
     /users/me/devices` `{ platform, token, app_id }`.
   - On sign-out / token refresh: `DELETE` (or re-`POST`) so the registry
     stays accurate. Deregister is best-effort.
   - Goes through the `managerApi` seam like every other call.
2. **Receipt handling**
   - Foreground (`pushNotificationReceived`): surface in the in-app
     notifications feed + a Success/Warning haptic (see the haptics map); do not
     duplicate an OS banner.
   - Background: the OS shows it; on tap (`pushNotificationActionPerformed`),
     deep-link to the relevant screen (visit / visitor / notifications).
3. **Preferences UI** — a settings screen that reads/writes the **central**
   prefs endpoints (per-type channels incl. `push`, quiet hours, kill switches),
   plus the host-arrival prefs (`/users/me/host-notification-prefs`). Optimistic
   with revert-on-failure; cache last-fetched prefs for offline display only.
4. **Local (device-only) prefs** — sound on/off, in-app foreground banner
   behavior, haptic-on-notification. No backend round-trip.

## Scoped push surfaces
Per `docs/native-feature-schedule.md` — high: `geofence_breach`, `checkin_failed`;
normal: `review_required`, `device_offline`, **host arrival (to the host)**;
in-app only: `visitor_checked_in` (staff), `visit_completed`.

## Dependencies
- `@capacitor/push-notifications` (not yet installed).
- iOS: Push Notifications capability + APNs; Android: FCM `google-services.json`
  (the Android `build.gradle` already conditionally applies the google-services
  plugin when the file is present).
- Backend Phase 9 (device endpoint, `push` channel, deliverer) + transport
  decision. **Do not build the client ahead of the backend contract.**

## Native-depth note
Push is one of the strongest App Store 4.2 signals for this live-web-view app —
but it's the heaviest lift. It stays a standalone, greenlit-then-scheduled
initiative, not a quick add. See `docs/native-app-store-plan.md`.
