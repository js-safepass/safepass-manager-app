# SafePass Client Apps — Contractor Q&A

Status: revised 2026-07-07.

> **Access:** detailed walkthroughs, screenshots, and system/staging access are
> provided **after a quote is agreed**. The written requirements and a focused API
> specification are the basis for scoping at this stage.

## Existing system

Yes — an internal web application and a self-service Kiosk client already use these
APIs. Screenshots, demos, and system access follow once a quote is agreed; the
requirement documents and API spec are sufficient for scoping.

## Detailed requirements

Yes. We have functional specifications for both apps — screen/feature inventories, key
user journeys, and per-endpoint API dependencies — which we can share now as the basis
for your estimate. No formal wireframes: **UX/UI design is part of your delivery.**

## API documentation

A machine-readable **OpenAPI 3.1** spec (Postman collection available on request). We
provide a **focused subset covering only the operations these apps perform**; each
endpoint carries an `x-apps` marker (`visitor` / `mapping` / `shared`) so the two apps
can be scoped independently. The backend is in production and the app-facing endpoints
are **live**; the spec is kept reconciled to the live routes by a CI gate. Response
shapes explicitly marked provisional in the spec (the metrics group, the auth
scope/one-time-code group, and the scope tree) will be frozen before build start; all
other shapes are stable.

## SafePass Manager (Visitor Management)

- **~10–15 screens/modules** — directory/search, visitor detail/create, photo
  enrollment, bulk import, host attach, visit scheduling, front-desk check-in,
  badge-pipeline status, notifications, operational dashboard.
- **Dashboards & notifications:** yes — live operational metrics; in-app feed + SSE.
- **Badges:** electronic — rendered/encoded server-side and pushed to the badge
  devices; the app shows pipeline status + a re-render action (no paper printing).
  Check-in is station-aware: the operator selects their front-desk station (listed by
  the API) and it scopes which badge pool check-in draws from.
- **Host attach:** hosts are attached to a visitor or visit three ways — picking an
  existing user or directory contact, free-text entry with server-side dedupe (on a
  conflict the API returns the existing record so the operator chooses keep / merge /
  overwrite), and API-ranked suggestions (the visitor's prior hosts, then popular hosts
  at the location). The app implements the picker and the conflict prompt; all matching
  logic is server-side. Host-directory administration (editing, consent management)
  stays in SafePass's web UI.
- **Approval workflow:** exists; the review queue ships in the web UI first and is
  planned for this app in a later phase.
- **Roles & permissions:** yes — role-based with org → division → location → building →
  station scope narrowing, server-enforced. Each app also gets its own scoped client
  credential. In the UI this is conditional rendering (out-of-scope actions are hidden
  or disabled), not separate per-role view sets, so it is a light quoting factor.

## Digital Mapping Tool

- **Approach:** image-based floorplans with geospatial anchoring (anchor lat/lng, scale
  in m/px, rotation); lat/lng is ground truth, converted to floorplan pixels
  client-side. Indoor positioning uses WiFi-fingerprint calibration → radio maps → a
  server-side tracking solver. Rendering library is the client's choice.
- **Expected functionality (full):** floorplan upload + alignment, route/waypoint
  editing, route versioning, per-floor geofence zones (polygon editing on the
  floorplan; optional per floor), calibration sessions with live progress, radio-map
  publish, live tracking map, and historical visit trace.
- Interface screenshots are provided after a quote is agreed.

## Mobile / tablet

- **Primarily web** (web-first hosted apps). A lightweight native shell is used only
  where a packaged tablet/mobile app is needed — the same pattern as our Kiosk — with
  device features delivered through thin Swift/Kotlin connectors or components around
  the shared web core.
- **Targets:** iPadOS/iOS and recent Android versions, tablets and phones; the same
  apps remain usable from a regular desktop browser where a client is configured for
  it.
- **Device features:** camera (visitor photos); push notifications + haptics for
  packaged builds. **No** barcode/QR scanning and **no** in-app badge printing (badges
  are electronic, handled server-side). Calibration WiFi scanning is done by the badge
  hardware, not the operator device.

## Integration notes

- **Auth:** sign-in via SafePass's hosted authentication; each app receives its own
  scoped client credential. Some organizations require a one-time-code re-verification
  after sign-in — build this as a generic "verify again" step (the second-factor
  mechanism is mid-rework currently).
- **Errors:** RFC 7807 `application/problem+json` with stable machine-readable codes.
- **Notifications stream:** SSE — fetch a short-lived stream ticket, open the stream,
  re-ticket on reconnect.
- **Concurrency:** editable resources return an `ETag` version; writes send `If-Match`.
- **Delivery & hosting:** SafePass hosts the apps. Delivery is the complete source
  repository (code, build tooling, assets); SafePass builds and deploys on its own
  infrastructure and accounts. Ongoing maintenance and support are scoped separately.

## Design expectations
An initial design reference is provided under 4-design-reference.html with more details available on engagement.