import { Button, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/useAuth.js';
import { useSession } from '../state/useSession.js';
import { useTheme } from '../state/useTheme.js';
import { useUserSettings } from '../state/useUserSettings.js';
import { tapLight } from '../lib/native/haptics.js';

// Profile — a dedicated PAGE reached from the bottom nav / sidebar (fleet
// normalization, owner decision 2026-07-23: the mapping app's bottom-menu
// Profile surface works better on phones than a header popover, so the
// topbar dropdown is gone). Carries the WS-4 settings: theme (Auto/Light/
// Dark, server-default local-override) and the manager-only timezone.
const THEME_OPTIONS = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

export default function Profile() {
  const { signOut } = useAuth();
  const { whoami, scopeLabel, activeScope } = useSession();
  const { mode, setMode } = useTheme();
  const { settings, updateSettings } = useUserSettings();

  const pickTheme = (next) => {
    tapLight();
    setMode(next);
    updateSettings({ theme: next }); // roams via /users/me/settings, best-effort
  };

  const scopeChain = [scopeLabel, activeScope?.divisionName, activeScope?.locationName, activeScope?.buildingName]
    .filter(Boolean)
    .join(' › ');

  return (
    <div className="mx-auto d-flex flex-column gap-3" style={{ maxWidth: 520 }}>
      <h4 className="fw-bold mb-0">Profile</h4>

      <Card>
        <Card.Body>
          <div className="text-muted small text-uppercase mb-1">Account</div>
          <div className="text-truncate">{whoami?.email || '—'}</div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="d-flex flex-column gap-3">
          <div>
            <div className="text-muted small text-uppercase mb-2">Theme</div>
            <div className="btn-group w-100" role="group" aria-label="Theme">
              {THEME_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm ${mode === value ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => pickTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-muted small text-uppercase mb-2">Timezone</div>
            <select
              className="form-select form-select-sm"
              value={settings?.user_timezone || ''}
              onChange={(e) => updateSettings({ user_timezone: e.target.value || null })}
              aria-label="Timezone"
            >
              <option value="">Device default</option>
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="d-flex align-items-center gap-2">
          <div className="flex-grow-1 min-w-0">
            <div className="text-muted small text-uppercase mb-1">Workspace</div>
            <div className="text-truncate">{scopeChain || '—'}</div>
          </div>
          <Button as={Link} to="/scope" variant="outline-primary" size="sm">
            Change
          </Button>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          {/* Explicit sign-out = REAL logout: purges local residue and kills
              the hosted SSO cookie (AuthContext signOut hosted=true). */}
          <Button variant="outline-danger" size="sm" onClick={() => signOut()}>
            <i className="fas fa-arrow-right-from-bracket me-2" aria-hidden="true" />
            Sign out
          </Button>
        </Card.Body>
      </Card>
    </div>
  );
}
