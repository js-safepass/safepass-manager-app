# Apple App Store listing — SafePass Manager

## App name (≤30 chars)
`SafePass Manager`  <!-- 16 -->

## Subtitle (≤30 chars)
`Front-desk visitor management`  <!-- 29 -->

## Promotional text (≤170 chars, editable without review)
`Check visitors in and out, manage visitor and host records, and monitor your site in real time — the SafePass front-desk console.`

## Keywords (≤100 chars, comma-separated, no spaces after commas)
`visitor,check-in,front desk,reception,badge,host,visits,sign-in,security,workplace`  <!-- ~82 -->

## Description (≤4000 chars)
SafePass Manager is the front-desk console for SafePass visitor management.
Staff use it to check visitors in and out, manage visitor and host records, and
monitor site activity in real time.

Key capabilities:
• Front-desk check-in — fast fallback check-in with badge issuance and review gates.
• Visitor & visit records — searchable directory, visit history, host contacts, and photo capture.
• Live monitoring — real-time dashboards, notifications, and on-site tracking.
• Multi-site scope — organizations, divisions, locations, and buildings.

SafePass Manager requires an account provisioned by your organization and
connects to your SafePass backend. It is a staff tool for businesses and
institutions — not intended for personal or consumer use, or for children.
Sign-in is handled through your organization's secure single sign-on.

## Categorization
- Primary category: **Business**
- Secondary category: ‹optional — e.g. Productivity›

## URLs
- Support URL: ‹TBD https://safepass.com/support› (required)
- Marketing URL: ‹optional›
- **Privacy Policy URL: ‹TBD› (REQUIRED)**

## General
- Copyright: `‹TBD› © 2026 SafePass`
- Age rating: complete the questionnaire — see [questionnaires.md](questionnaires.md)
- App Privacy ("nutrition label"): see [questionnaires.md](questionnaires.md)
- App Review Information (demo account + notes): see [app-review-access.md](app-review-access.md)
- Sign-in required: **Yes** — supply the demo account in App Store Connect →
  App Review Information

## Version / "What's New" (template)
Initial release: visitor directory, visit lifecycle, front-desk check-in,
notifications, and live monitoring for SafePass organizations.

## Screenshots & icon
Tracked in [assets-checklist.md](assets-checklist.md): 1024×1024 icon (no alpha,
no rounded corners), 6.7"/6.9" iPhone screenshots required, iPad screenshots
only if the app is offered on iPad.

## Build & compliance
- Upload a signed **IPA** built in Xcode (owner has Xcode set up).
- Export compliance (encryption): see [questionnaires.md](questionnaires.md) —
  standard HTTPS/TLS only; recommend setting `ITSAppUsesNonExemptEncryption` in
  Info.plist to skip the per-build prompt.
