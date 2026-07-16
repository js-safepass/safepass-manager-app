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

// No browser gate here (unlike the kiosk chassis): SafePass Manager is
// deliberately usable from a desktop browser as well as the Capacitor shells.

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
