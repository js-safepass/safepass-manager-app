# Internal testing distribution — SafePass Manager

Status: ACTIVE (2026-07-24). How to get signed builds to testers via Play
Console internal testing / TestFlight. Store-listing copy lives in `store/`;
the 4.2 strategy in `docs/native-app-store-plan.md`.

## Icons & splash (done)

`assets/` holds the sources (white SP monogram extracted from the live kiosk
icon + per-app gradient — manager is navy→blue `#0c2556→#3378FF`). Regenerate
everything with:

```bash
npx @capacitor/assets generate --ios --android
# then discard the tool's cosmetic AndroidManifest.xml / pbxproj reformatting
```

## Android → Play Console internal testing

One-time:

```bash
# 1. Upload keystore (KEEP OUT OF THE REPO — store in the password manager)
keytool -genkeypair -v -keystore ~/keystores/safepass-manager-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000

# 2. android/keystore.properties (git-ignored; see keystore.properties.example)
#    storeFile=/Users/you/keystores/safepass-manager-upload.jks
#    storePassword=… keyAlias=upload keyPassword=…
```

- In Play Console: create the app (`com.safepass.manager`), **opt in to Play
  App Signing** (Google holds the app key; ours is only the upload key — a
  lost upload key is recoverable, a lost self-managed app key is not).

Per release:

```bash
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
npx cap sync android          # config/plugins only — the shell is a live web view
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` (Play requires AAB, not APK) to **Testing → Internal
testing → Create release**, add testers by email list, share the opt-in link.
Bump `versionCode` (integer, must increase every upload) + `versionName` in
`android/app/build.gradle` per release.

**Android Studio: not needed for this.** Signing is already Gradle-wired,
builds are one CLI command, and the upload is a browser step either way.
Install it later only if we need native debugging/profiling on device.

## iOS → TestFlight

Xcode is mandatory here (signing + archive) — no way around it, but it's the
whole toolchain; nothing else to install.

One-time: Apple Developer Program membership; in Xcode → Signing &
Capabilities set the Team (bundle id `com.safepass.manager` registers
automatically with "Automatically manage signing").

Per release: `npx cap sync ios`, open `ios/App/App.xcodeproj`, select
**Any iOS Device**, Product → Archive, then Organizer → Distribute App →
TestFlight. Internal testers (up to 100 App Store Connect users) get builds
immediately — no review; external tester groups need a light beta review.
Bump the build number each archive (Xcode can auto-increment).

## Reminders

- The live-web-view shell means testers get web changes via self-update;
  new binaries are only needed for native/plugin/icon changes — like this
  icon change, so the first internal-testing build should follow it.
- Release builds point at prod (`https://manage.safepass.com` per
  `capacitor.config.ts`); `CAP_SERVER_URL` overrides at sync time for a
  staging-pointed test build.
