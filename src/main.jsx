import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Design system ported from sentinel-ui (see docs/build-plan.md Phase 0.5).
// DM Sans is self-hosted via @fontsource (CSP has no external style/font
// sources; app must stay servable on-prem). SCSS import order matters:
// datum (base) → custom (SafePass) → customizer (runtime vars, loads LAST
// so its :root variables win).
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/700.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './assets/scss/datum.scss'
import './assets/scss/custom.scss'
import './assets/scss/customizer.scss'
import './assets/scss/manager-app.scss'
import App from './App.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { NetworkProvider } from './state/NetworkContext.jsx'
import { FlashProvider } from './lib/flashProvider.jsx'
import ErrorBoundary from './pages/components/ErrorBoundary.jsx'
import { isNative } from './lib/platform.js'

// Production browser gate (App Store guideline 4.2). SafePass Manager is a
// live-web-view app: the JS served at the prod origin is loaded by the Capacitor
// shells via server.url, so a random browser visitor hitting the PROD url should
// NOT get a working app — that reads as a generic web wrapper. Desktop operators
// use the existing web operator UI instead. Native (isNative) bypasses; staging
// + dev leave the flag unset so the web build stays usable for QA. Prod-only
// opt-in via VITE_BLOCK_BROWSER_ACCESS (.env.production). Dropping desktop
// support here is intentional (confirmed 2026-07-23), superseding the earlier
// inferred "browser is a supported surface" stance.
if (!isNative && import.meta.env.VITE_BLOCK_BROWSER_ACCESS === 'true') {
  const root = document.getElementById('root');
  if (root) {
    // TODO(store-links): set the real App Store id once the listing is live.
    const appStoreUrl = 'https://apps.apple.com/app/id0000000000';
    const playUrl = 'https://play.google.com/store/apps/details?id=com.safepass.manager';
    const btn = 'display:inline-block;padding:10px 18px;border-radius:8px;background:#4c8bf5;color:#fff;text-decoration:none;font-weight:600;';
    root.innerHTML = `
      <div style="position:fixed;inset:0;background:#1c2033;color:#fff;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <main style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;">
          <h1 style="font-size:2.25rem;margin:0 0 16px;font-weight:600;">SafePass Manager</h1>
          <p style="font-size:1.1rem;max-width:520px;margin:0 0 24px;opacity:0.85;line-height:1.5;">
            Get the SafePass Manager app for your phone.
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
            <a href="${appStoreUrl}" style="${btn}">App Store</a>
            <a href="${playUrl}" style="${btn}">Google Play</a>
          </div>
        </main>
        <footer style="padding:24px;text-align:center;font-size:0.9rem;opacity:0.7;line-height:1.5;">
          <div>Visitor management for organizations</div>
          <div style="margin-top:4px;"><a href="https://safepass.com" style="color:#4c8bf5;text-decoration:none;">safepass.com</a></div>
        </footer>
      </div>
    `;
  }
  // Stop — do not mount the React app on a production browser.
  throw new Error('SafePass Manager is app-only on production; browser access gated (guideline 4.2).');
}

// Content Security Policy — two layers, always both present in production:
//   1. public/_headers is the AUTHORITATIVE edge policy (Cloudflare Workers
//      Static Assets). It carries the full set, incl. `frame-ancestors 'none'`
//      + X-Frame-Options/X-Content-Type-Options/Referrer-Policy, which a <meta>
//      tag CANNOT express.
//   2. This <meta> tag is an ALWAYS-ON floor (dev AND prod) so the app is never
//      left with ZERO CSP if the edge header isn't served (misconfig, a plain
//      static host, `vite preview`). It omits only the header-only directives
//      above. KEEP THESE DIRECTIVES IN SYNC WITH public/_headers.
// Native is skipped — the WebView loads the hosted origin and inherits the
// header CSP; a meta tag there would be redundant.
if (!isNative) {
  // Dev server only: widen connect-src for the Vite HMR websocket (dev is
  // pinned to 5273; HMR dials ws://host). Prod uses the header's connect-src.
  const host = window.location.host;
  const connectSrc = import.meta.env.DEV
    ? `connect-src 'self' https: http://${host} ws://${host}`
    : "connect-src 'self' https:";
  const cspContent = [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "script-src 'self'",
    connectSrc,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
  ].join('; ') + ';';

  const cspMeta = document.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = cspContent;
  document.head.appendChild(cspMeta);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <NetworkProvider>
        <AuthProvider>
          <FlashProvider>
            <App />
          </FlashProvider>
        </AuthProvider>
      </NetworkProvider>
    </ErrorBoundary>
  </StrictMode>,
)
