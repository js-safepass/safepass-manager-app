import { useAuth } from './state/useAuth.js';
import { ApiProvider } from './state/ApiContext.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';

// Top-level state router for the Phase-0 skeleton: Login ↔ Home on auth
// status. React Router lands with the first real routed screens (decision
// #8 in docs/build-plan.md) — the brief requires tenant-safe direct-link
// routes to visitors/visits, so this file stays a thin gate, not a
// hand-rolled router.
export default function App() {
  const { status } = useAuth();

  if (status !== 'signed_in') {
    return (
      <div className="page">
        <Login />
      </div>
    );
  }

  return (
    <ApiProvider>
      <Home />
    </ApiProvider>
  );
}
