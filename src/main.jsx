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

// Inject Content Security Policy for web deployments.
// Skip on native — Capacitor's WKWebView/WebView already isolates content,
// and custom URL schemes (safepassmanager://) break CSP 'self' resolution.
if (!isNative) {
  const devConnectSrc = import.meta.env.DEV ? ' http://localhost:5173 ws://localhost:5173' : '';
  const cspContent = [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self' https://*${devConnectSrc}`,
    "img-src 'self' data: blob: https://*",
    "style-src 'self' 'unsafe-inline'",
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
