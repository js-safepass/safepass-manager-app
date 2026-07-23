# Store submission — SafePass Manager

Copy, metadata, and submission questionnaires for publishing **SafePass Manager**
(`com.safepass.manager`) to the **Google Play Store** and **Apple App Store**.
This directory is the source of truth you paste into Play Console / App Store
Connect — keep it in sync whenever a listing changes.

> **Nature of this app.** SafePass Manager is a staff-facing, **login-gated
> enterprise** visitor-management tool. There is no consumer self-signup —
> accounts are provisioned per organization. Reviewers cannot exercise it
> without a demo account, so [app-review-access.md](app-review-access.md) is
> **mandatory** for both stores. If a public listing isn't required, consider
> **managed / unlisted distribution** (Managed Google Play, Apple Business
> Manager custom apps).

## Files
| File | Purpose |
|---|---|
| [listing-google-play.md](listing-google-play.md) | Play Store listing copy + settings |
| [listing-apple-app-store.md](listing-apple-app-store.md) | App Store listing copy + settings |
| [questionnaires.md](questionnaires.md) | Data Safety, App Privacy, content/age rating, export compliance |
| [app-review-access.md](app-review-access.md) | Reviewer demo account + notes (login required) |
| [assets-checklist.md](assets-checklist.md) | Icon / screenshot / graphic specs + status |

## Conventions
- `‹TBD›` marks owner/legal input needed before submission.
- **Never commit real reviewer credentials, keystore secrets, or API keys.**
  Demo creds live in your password manager; this dir only points at them.
- Character counts below are hard store limits — stay under them.
- The **privacy questionnaires carry legal weight** — review `questionnaires.md`
  with whoever owns privacy/legal before you certify the forms.

## Submission status
| Item | Google Play | Apple App Store |
|---|---|---|
| Listing copy finalized | ☐ | ☐ |
| Screenshots / graphics | ☐ | ☐ |
| Privacy policy URL live | ☐ ‹TBD› | ☐ ‹TBD› |
| Data-safety / privacy form | ☐ | ☐ |
| Content / age rating | ☐ | ☐ |
| Demo account for review | ☐ | ☐ |
| Signed build uploaded (AAB / IPA) | ☐ | ☐ |

## Character-limit cheat-sheet
| Field | Play | Apple |
|---|---|---|
| App name / title | 30 | 30 |
| Subtitle | — | 30 |
| Short description | 80 | — |
| Promotional text | — | 170 |
| Keywords | — | 100 |
| Full description | 4000 | 4000 |
