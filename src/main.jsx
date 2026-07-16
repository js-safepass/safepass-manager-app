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

// Content Security Policy:
//   - DEPLOYED (staging/production, and the native live web view that loads the
//     hosted origin): served as a real edge header from public/_headers — the
//     authoritative policy, and the ONLY place `frame-ancestors` can live (it is
//     ignored in a <meta> tag).
//   - DEV SERVER only: Vite doesn't serve _headers, so inject an equivalent
//     <meta> CSP here, widened for the HMR websocket. Keeping this dev-only
//     avoids a second, drifting production CSP.
// Native is skipped regardless — the WebView isn't the Vite dev server and
// inherits the hosted origin's header CSP.
if (!isNative && import.meta.env.DEV) {
  const host = window.location.host; // dev is pinned to 5273; HMR uses ws://host
  const cspContent = [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "script-src 'self'",
    `connect-src 'self' https: http://${host} ws://${host}`,
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
