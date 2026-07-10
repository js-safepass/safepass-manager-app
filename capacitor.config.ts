import type { CapacitorConfig } from '@capacitor/cli';

// Default to the production Cloudflare deployment. Override at cap-sync time
// via `CAP_SERVER_URL=...` for staging / preview / local-dev builds. The iOS
// build phase script at ios/scripts/select-server-url.sh wires this up
// automatically based on the active Xcode configuration (Debug vs Release).
const serverUrl = process.env.CAP_SERVER_URL || 'https://manage.safepass.com';

const config: CapacitorConfig = {
  appId: 'com.safepass.manager',
  appName: 'SafePass Manager',
  webDir: 'dist',

  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    backgroundColor: '#1c2033',
  },
  android: {
    backgroundColor: '#1c2033',
    allowMixedContent: false,
  },

  plugins: {
    CapacitorHttp: {
      // Disabled — with server.url set, the WebView loads from the real
      // https://manage.safepass.com origin and CORS works natively against
      // api.safepass.com, auth.safepass.com, and S3. No native HTTP bridge needed.
      // NOTE: CapacitorHttp MUST be disabled when using server.url because its
      // GET proxy rewrites URLs to the server hostname, hitting the real server
      // instead of the local scheme handler (causing 404s).
      enabled: false,
    },
    Camera: {
      // Rear camera default is fine for staff photographing a visitor;
      // the OS camera UI lets them flip it.
      presentationStyle: 'fullscreen',
    },
  },

  server: {
    // Load the web app from the hosted URL — not from the local bundle.
    // This allows web app updates to ship via Cloudflare without a native
    // rebuild. The native shell only needs updating for Swift/Kotlin changes,
    // new Capacitor plugins, or OAuth scheme changes.
    url: serverUrl,
    // Offline fallback — loaded from the local bundle when the remote URL
    // is unreachable (no internet, DNS failure, etc.).
    errorPath: 'offline.html',
    // OAuth deep-link callback (safepassmanager://) is handled separately
    // via CFBundleURLTypes in Info.plist + @capacitor/app appUrlOpen.
  },
};

export default config;
