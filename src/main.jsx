import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { KioskSessionProvider } from './state/KioskSessionContext.jsx'
import ErrorBoundary from './pages/components/ErrorBoundary.jsx'
import { NetworkProvider } from './state/NetworkContext.jsx'
import { isNative } from './lib/platform.js'

// Production browser gate. SafePass Lobby is a B2B kiosk app deployed on
// iPad via Capacitor; the JS source served at kiosk.safepass.com is loaded
// by the native shell at runtime via Capacitor's server.url. Random web
// visitors hitting the URL directly should NOT get a working kiosk —
// that would be functionally indistinguishable from a generic web wrapper
// (App Store guideline 4.2 territory).
//
// Native shell sees `isNative=true` and skips the gate. Dev/staging builds
// don't set the flag and bypass. Production-only opt-in via the dedicated
// VITE_BLOCK_BROWSER_ACCESS env var (set in .env.production), kept isolated
// from VITE_MODE so the gate's intent is explicit and toggleable per-env
// without entangling other behavior.
if (!isNative && import.meta.env.VITE_BLOCK_BROWSER_ACCESS === 'true') {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="
        position: fixed;
        inset: 0;
        background: #1c2033;
        color: #ffffff;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <main style="
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
        ">
          <h1 style="font-size: 2.25rem; margin: 0 0 16px; font-weight: 600;">SafePass Lobby</h1>
          <p style="font-size: 1.1rem; max-width: 520px; margin: 0; opacity: 0.85; line-height: 1.5;">
            Download the SafePass Lobby app from the App Store.
          </p>
        </main>
        <footer style="
          padding: 24px;
          text-align: center;
          font-size: 0.9rem;
          opacity: 0.7;
          line-height: 1.5;
        ">
          <div>Visitor management for organizations</div>
          <div style="margin-top: 4px;">
            <a href="https://safepass.com" style="color: #1eb3a7; text-decoration: none;">safepass.com</a>
          </div>
        </footer>
      </div>
    `;
  }
  // Stop. Do not mount the React kiosk app.
  throw new Error('SafePass Lobby is iPad-only. Gating browser access on production build.');
}

// Inject Content Security Policy for web deployments.
// Skip on native — Capacitor's WKWebView/WebView already isolates content,
// and custom URL schemes (safepasskiosk://) break CSP 'self' resolution.
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
          <KioskSessionProvider>
            <App />
          </KioskSessionProvider>
        </AuthProvider>
      </NetworkProvider>
    </ErrorBoundary>
  </StrictMode>,
)
