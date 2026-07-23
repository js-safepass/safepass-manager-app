# Submission questionnaires — SafePass Manager

Drafted answers for the store forms, based on what the app **actually** does
(audited 2026-07-22): Android declares only `INTERNET`; iOS declares
`NSCameraUsageDescription`; the app captures **visitor photos** (Camera) and
handles **visitor personal data**; it does **not** use device location,
contacts, microphone, or advertising/analytics SDKs. Auth is AWS GovCloud
Cognito hosted login; tokens are in-memory / sessionStorage.

> ⚠️ **These declarations are legally binding.** You (or the deploying
> organization) are the data controller. Confirm every answer against your
> real backend behavior and privacy policy with whoever owns privacy/legal
> before certifying. Where this app is a processor for a customer org, the
> org's DPA/privacy policy governs.

---

## 1. Google Play — Data safety
**Does your app collect or share any of the required user data types?** Yes (collect).
**Is all data encrypted in transit?** Yes (HTTPS/TLS; app enforces a CSP).
**Do you provide a way to request data deletion?** ‹TBD — via the organization /
backend; provide the mechanism/URL›.

Data **collected** (not "shared" — the SafePass backend is first-party
infrastructure, not a third party), purpose **App functionality**, linked to the
user, not used for tracking/ads:

| Data type | Collected | Notes |
|---|---|---|
| Personal info — Name, Email, Phone | Yes | User account + visitor/host records |
| Photos | Yes | Visitor check-in photos (Camera) |
| App activity — in-app actions | Yes | Visit/check-in events, functionality only |
| App info & performance | ‹confirm› | Only if crash/diagnostic logging exists |
| Location | **No** | App declares no location permission |
| Contacts (device) | **No** | "Host contacts" are backend records, not device contacts |
| Financial, Health, Messages, Audio, Files | **No** | |

- Advertising / third-party analytics SDKs: **None** ‹confirm no analytics SDK added›.
- Data shared with third parties: **None** ‹confirm — first-party backend only›.

---

## 2. Apple — App Privacy ("nutrition label")
**Data used to track you:** **None** (no cross-app/website tracking, no IDFA).

**Data linked to your identity** (purpose: App Functionality):
- Contact Info — name, email, phone
- Photos (visitor images)
- User Content — visitor/visit records
- Identifiers — user/account ID

**Data not linked to you:** ‹Diagnostics only if crash logging exists — else None›.

Set the matching answers in App Store Connect → App Privacy. Recommend adding
an in-Info.plist encryption declaration (see §4).

---

## 3. Content / age rating
### Google Play — IARC questionnaire
Business utility, no objectionable content. Expected result: **Everyone / PEGI 3**.
- Violence, sexual content, profanity, controlled substances, gambling: **No**
- User-generated content shared publicly / social features: **No** (staff enter
  records; no public sharing)
- Users interact / connect online: **Yes** (networked business app)
- Shares user location: **No**
- Digital purchases: **No**

### Apple — Age rating
Expected: **4+**. No objectionable content categories apply.
- **Unrestricted Web Access:** answer **No** — the app loads a fixed hosted
  origin (a live web view of your own site), not a general-purpose browser.

---

## 4. Export compliance (encryption)
The app uses only standard HTTPS/TLS (and platform crypto) — no proprietary or
non-standard encryption. This qualifies for the standard exemption.
- **Apple:** "Does your app use non-exempt encryption?" → **No**. Recommend
  adding `ITSAppUsesNonExemptEncryption = false` to `ios/App/App/Info.plist` so
  the prompt is skipped every build. ‹Confirm with legal if any non-exempt
  crypto is ever added.›
- **Google Play:** no separate export form; ensure compliance with US/EU export
  law for your distribution regions.

---

## 5. Sensitive permissions justification (for review + store forms)
- **Camera (iOS `NSCameraUsageDescription`)** — *"used to capture visitor
  check-in photos."* Only sensitive permission the app requests.
- **Android** — only `INTERNET`; no runtime-permission prompts.

---

## 6. Account deletion (Apple Guideline 5.1.1(v))
Apple requires in-app account deletion for apps that support account creation.
This app has **no in-app signup** — accounts are provisioned/managed by the
organization (enterprise-managed). The managed-account path is the recognized
alternative; state clearly in App Review notes that accounts are org-managed and
deleted via the administrator/backend. ‹Confirm current Apple guidance and
document the deletion path.›
