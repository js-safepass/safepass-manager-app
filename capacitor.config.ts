import type { CapacitorConfig } from '@capacitor/cli';

// Default to the production Cloudflare deployment. Override at cap-sync time
// via `CAP_SERVER_URL=...` for staging / preview / local-dev builds. The iOS
// build phase script at ios/scripts/select-server-url.sh wires this up
// automatically based on the active Xcode configuration (Debug vs Release).
const serverUrl = process.env.CAP_SERVER_URL || 'https://kiosk.safepass.com';

const config: CapacitorConfig = {
  appId: 'com.safepass.kiosk',
  appName: 'SafePass Lobby',
  webDir: 'dist',

  // Full-screen WKWebView — no browser chrome
  ios: {
    scheme: 'SafePass Lobby',
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
      // https://kiosk.safepass.com origin and CORS works natively against
      // api.safepass.com, auth.safepass.com, and S3. No native HTTP bridge needed.
      // NOTE: CapacitorHttp MUST be disabled when using server.url because its
      // GET proxy rewrites URLs to the server hostname, hitting the real server
      // instead of the local scheme handler (causing 404s).
      enabled: false,
    },
    StatusBar: {
      // Hide the status bar for a true kiosk feel
      style: 'DARK',
      backgroundColor: '#1c2033',
    },
    Keyboard: {
      // 'none' — WebView frame does not reflow when the keyboard appears.
      // Pages with text inputs are laid out top-anchored (Setup's setup-section
      // has margin-top:24px; Form.jsx uses paddingTop:60px and column flex),
      // so the keyboard floating over the lower 40% of landscape doesn't cover
      // the input fields. Avoids the iOS WKWebView quirk where 'native' resize
      // mode would intermittently fail to dispatch keyboardWillHide on tap-out
      // and leave the layout displaced.
      resize: 'none',
    },
    Camera: {
      // Use the front-facing camera by default
      presentationStyle: 'fullscreen',
    },
    ScreenOrientation: {
      // Lock to landscape
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
    // OAuth deep-link callback (safepasskiosk://) is handled separately
    // via CFBundleURLTypes in Info.plist + @capacitor/app appUrlOpen.
  },
};

export default config;
