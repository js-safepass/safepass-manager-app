# App review access — SafePass Manager

Both stores require reviewers to reach **all** functionality. This app is fully
login-gated, so a working demo account and clear notes are mandatory
(Play Console → "App access"; App Store Connect → "App Review Information").

> 🔒 **Do NOT commit real credentials to this repo.** Fill the demo account into
> the store console directly, and keep the canonical copy in your password
> manager. The fields below are placeholders.

## Demo account (enter in the store console, not here)
- Username / email: `‹TBD demo user provisioned in a review org›`
- Password: `‹TBD — store in password manager›`
- Organization / scope: `‹TBD — a review org with sample visitors, hosts, visits›`
- MFA: this pool enforces MFA at the Cognito level. ‹If the reviewer would hit
  an MFA challenge, provide a reviewer-friendly path — e.g. a demo user exempt
  from MFA, or shared TOTP seed instructions. Confirm with auth owner.›

## Reviewer notes (paste into the console)
SafePass Manager is a staff-facing visitor-management console for businesses and
institutions. It is not a consumer app and has no public signup — accounts are
provisioned by each customer organization.

To review:
1. Launch the app; tap Sign in. You'll be taken to our secure single sign-on
   (AWS-hosted). Enter the demo credentials provided.
2. After sign-in the app loads the demo organization's dashboard.
3. Explore: Visitors (directory + records), Visits (lifecycle + check-in),
   Notifications, and the Dashboard/monitoring views. On small screens, use the
   bottom tab bar; on tablets, the side navigation.
4. Front-desk check-in and visitor photo capture use the device camera.

Technical notes for review:
- The app is a live web view of our hosted site (`server.url`); it requires
  network access and will show an offline screen with no connection.
- The only device permission used is the camera (visitor photos).
- No advertising, no tracking, no in-app purchases.

## Review contact
- Name: `‹TBD›`
- Email: `‹TBD›`
- Phone: `‹TBD›`
