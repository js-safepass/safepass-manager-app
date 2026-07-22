# Google Play listing — SafePass Manager

## Title (≤30 chars)
`SafePass Manager`  <!-- 16 -->

## Short description (≤80 chars)
`Front-desk visitor management: check-in, records, and live monitoring.`  <!-- 69 -->

## Full description (≤4000 chars)
SafePass Manager is the front-desk console for SafePass visitor management.
Staff use it to check visitors in and out, manage visitor and host records, and
monitor site activity in real time.

Key capabilities:
• Front-desk check-in — fast, one-tap fallback check-in with badge issuance and review gates.
• Visitor & visit records — searchable directory, visit history, host contacts, and photo capture.
• Live monitoring — real-time dashboards, notifications, and on-site tracking.
• Multi-site scope — switch across organizations, divisions, locations, and buildings.

SafePass Manager requires an account provisioned by your organization and
connects to your SafePass backend. It is a staff tool for businesses and
institutions — it is not intended for personal or consumer use, or for children.
Sign-in is handled through your organization's secure single sign-on.

> ‹TBD: tighten marketing tone with whoever owns brand voice.›

## Categorization
- Application type: **App**
- Category: **Business**
- Tags: ‹choose up to 5 in Console — e.g. Business, Productivity›

## Contact details
- Support email: ‹TBD e.g. support@safepass.com› (required)
- Phone: ‹optional›
- Website: ‹TBD https://safepass.com›
- **Privacy policy URL: ‹TBD› (REQUIRED — must be live before submission)**

## Store settings
- Pricing: **Free**
- Contains ads: **No**
- In-app purchases: **No**
- Content rating: complete IARC questionnaire — see [questionnaires.md](questionnaires.md)
- Data safety: see [questionnaires.md](questionnaires.md)
- Target audience & content: **18+ / business**, not directed at children
- App access: **All functionality is behind a login** → provide the demo
  account from [app-review-access.md](app-review-access.md) in Play Console →
  "App access"
- Countries / regions: ‹TBD›
- Government app: ‹TBD — the backend uses AWS GovCloud; confirm whether the
  Play "Government apps" declaration applies to your distribution›

## Release notes / "What's new" (template)
Initial release: visitor directory, visit lifecycle, front-desk check-in,
notifications, and live monitoring for SafePass organizations.

## Graphics
Tracked in [assets-checklist.md](assets-checklist.md): app icon 512×512,
feature graphic 1024×500, 2–8 phone screenshots (tablet optional).

## Build
- Upload the signed **AAB**: `bundleRelease` (see repo `android/` release
  signing). Play App Signing manages the app signing key; you upload with your
  upload key.
