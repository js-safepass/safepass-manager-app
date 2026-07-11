import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { NetworkProvider } from './state/NetworkContext.jsx'
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
          <App />
        </AuthProvider>
      </NetworkProvider>
    </ErrorBoundary>
  </StrictMode>,
)
