import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/useAuth.js';
import { ApiProvider } from './state/ApiContext.jsx';
import { SessionProvider } from './state/SessionContext.jsx';
import { UserSettingsProvider } from './state/UserSettingsContext.jsx';
import { NotificationsProvider } from './state/NotificationsContext.jsx';
import FlashOverlay from './components/FlashOverlay.jsx';
import AndroidBackHandler from './components/AndroidBackHandler.jsx';
import SessionGate from './components/SessionGate.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VisitorsList from './pages/visitors/VisitorsList.jsx';
import VisitorDetail from './pages/visitors/VisitorDetail.jsx';
import VisitsList from './pages/visits/VisitsList.jsx';
import NotificationsInbox from './pages/NotificationsInbox.jsx';
import ScopePicker from './pages/ScopePicker.jsx';

// Auth gate over the routed app. Signed out, every path renders Login (which
// also handles the /auth/callback and /auth/logout redirects); signed in,
// the router serves direct-link routes — tenant-safe 404s from the API
// render as the standard not-found/error states in each page.
export default function App() {
  const { status } = useAuth();

  // Native boot restore (Tier 1): a stored session is being exchanged for
  // fresh tokens (~1-2s). A quiet brand splash — NOT the Login screen, which
  // would flash and read as a logout.
  if (status === 'restoring') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center min-vh-100 gap-3">
        <i className="fas fa-shield-halved fs-1 text-primary" aria-hidden="true" />
        <div className="text-muted small">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Signing you in…
        </div>
      </div>
    );
  }

  if (status !== 'signed_in') {
    return (
      <>
        <FlashOverlay />
        <Login />
      </>
    );
  }

  return (
    <ApiProvider>
      <SessionProvider>
        <UserSettingsProvider>
        <SessionGate>
          <NotificationsProvider>
            <BrowserRouter>
              <AndroidBackHandler />
              <FlashOverlay />
              <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/visitors" element={<VisitorsList />} />
              <Route path="/visitors/:visitorId" element={<VisitorDetail />} />
              <Route path="/visits" element={<VisitsList />} />
              <Route path="/notifications" element={<NotificationsInbox />} />
              <Route path="/scope" element={<ScopePicker />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
              </Routes>
            </BrowserRouter>
          </NotificationsProvider>
        </SessionGate>
        </UserSettingsProvider>
      </SessionProvider>
    </ApiProvider>
  );
}
