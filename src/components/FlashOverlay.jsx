// FlashOverlay.jsx
//
// Fixed-position toast stack for flash notifications.
// Consumed automatically by FlashProvider — mount once in the app layout.
//
// Geometry follows the FLEET toast contract (owner 2026-07-23, round 2):
// TOP, safe-area aware, FULL WIDTH minus 1rem margins — anchored to both
// edges so phones get the whole row (max-content sizing read as a cramped
// pill); margin:auto + the 480px cap keeps desktop from a wall-to-wall
// banner. Dismiss timings match the mapping app (6/8/10/12s by severity).

import { Alert } from 'react-bootstrap';
import { useFlash } from '../lib/flashProvider';

const OVERLAY_STYLE = {
  position: 'fixed',
  top: 'calc(1rem + var(--app-inset-top, 0px))',
  left: '1rem',
  right: '1rem',
  margin: '0 auto',
  zIndex: 1080, // above Bootstrap modals (1050) and navbars
  maxWidth: '480px',
  pointerEvents: 'none',
};

const ITEM_STYLE = {
  pointerEvents: 'auto',
  boxShadow: '0 0.25rem 0.75rem rgba(0, 0, 0, 0.15)',
};

export default function FlashOverlay() {
  const { items, dismiss } = useFlash();

  if (!items.length) return null;

  return (
    <div className="flash-overlay-container" style={OVERLAY_STYLE}>
      {items.map((item) => (
        <Alert
          key={item.id}
          variant={item.variant}
          dismissible
          onClose={() => dismiss(item.id)}
          // ps-3/pe-5, NOT px-3: Bootstrap absolutely positions the dismiss X
          // and reserves 3rem right padding on .alert-dismissible — px-3
          // overrode that to 1rem, running text under the X. pe-5 restores
          // the reserve so long messages wrap before reaching the button.
          className="flash-overlay-alert mb-2 py-2 ps-3 pe-5 small d-flex align-items-center"
          style={ITEM_STYLE}
        >
          {item.message}
        </Alert>
      ))}
    </div>
  );
}
