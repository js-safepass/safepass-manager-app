import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/useAuth.js';
import { ApiProvider } from './state/ApiContext.jsx';
import { SessionProvider } from './state/SessionContext.jsx';
import { NotificationsProvider } from './state/NotificationsContext.jsx';
import FlashOverlay from './components/FlashOverlay.jsx';
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
        <SessionGate>
          <NotificationsProvider>
            <BrowserRouter>
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
      </SessionProvider>
    </ApiProvider>
  );
}
