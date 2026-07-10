# SafePass Client Apps — Requirements Overview

Status: revised 2026-07-07.

A high-level overview of two applications SafePass is commissioning. Detailed functional and technical documentation is available on request.

## The applications

Two operator-facing applications that run on top of SafePass's existing platform. The
work is the client applications; the backend behind them already exists.

1. **Visitor Management** — front-desk tooling to manage visitors and their hosts,
   schedule visits, check visitors in and out, handle visitor badges, and view
   day-to-day notifications and dashboards.
2. **Mapping** — operator tooling to set up building floorplans, run calibration,
   publish indoor-positioning maps, and view live and historical visitor location on
   those maps.

The two apps are independent and can be quoted together or separately.

## Platform

- The apps are built web-first, delivered as web applications hosted by SafePass, so
  updates ship without app-store release cycles.
- Where a customer needs an installed tablet or mobile app, the web app is wrapped in a
  lightweight native shell (for example, our Kiosk app uses a WebView / Capacitor-style
  approach). Target platforms are iPadOS/iOS and recent Android versions, on tablets and
  phones; the same apps remain usable from a regular desktop browser where a client is
  configured for it.
- The apps are native-inclusive, not native-only: features that benefit from device
  capability (push notifications, haptics, camera capture) are delivered through thin
  Swift/Kotlin connectors or components around the shared web core, keeping code
  duplication and per-platform maintenance low.

## How it connects

- Both apps consume SafePass's existing backend API; the contractor builds clients
  against it.
- User sign-in is handled by SafePass's hosted authentication at **auth.safepass.com**.
  The apps do not build or run a login system. Some organizations additionally require a
  one-time-code re-verification after sign-in; the apps present this as a simple prompt
  (flow documented in the API spec).
- Each app is issued its **own client credential (token)**, so its access is scoped to
  the functions that app needs — the Visitor app cannot reach Mapping functions, and
  vice-versa.

## What SafePass provides (on engagement)

- Access to the API and relevant documentation.
- Hosted authentication (`auth.safepass.com`) and a per-app client credential.
- A dedicated staging environment for development and testing, provided at project start.
- Reference and brand material for the look and feel.

## What we're asking for

- A proposal and quote to design and build these apps.
- UX/UI design is expected as part of the delivery. SafePass can supply reference
  designs where available.
- Delivery is the complete source repository: SafePass builds, hosts, and deploys the
  apps on its own infrastructure and accounts (no contractor-side hosting or app-store
  submissions).
- Proposals should include acceptance criteria and a testing approach. Ongoing
  maintenance and support will be scoped separately.

## Not in scope

- The backend/API, the login system, and SafePass's internal administration console.
- The self-service kiosk, the indoor-tracking engine, facial-recognition services, and
  any device or hardware firmware.

## Notes

This is a high-level overview. Detailed functional and technical specifications are
available on request.
