// FlashOverlay.jsx
//
// Fixed-position toast stack for flash notifications.
// Consumed automatically by FlashProvider — mount once in the app layout.
//
// Geometry follows the FLEET toast contract (scope-spec "additional items",
// 2026-07-23; the mapping app's sp-toast is the reference): TOP-CENTER,
// safe-area aware, width capped to min(92vw, 480px). The previous top-right
// `width:100%` + `maxWidth:28rem` overflowed the LEFT edge on any viewport
// narrower than ~29rem, and the fixed `top:1rem` sat under the phone's
// status bar — both owner-reported defects. Dismiss timings already match
// the mapping app (6/8/10/12s by severity).

import { Alert } from 'react-bootstrap';
import { useFlash } from '../lib/flashProvider';

const OVERLAY_STYLE = {
  position: 'fixed',
  top: 'calc(1rem + var(--app-inset-top, 0px))',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1080, // above Bootstrap modals (1050) and navbars
  width: 'max-content',
  maxWidth: 'min(92vw, 480px)',
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
          className="flash-overlay-alert mb-2 py-2 px-3 small d-flex align-items-center"
          style={ITEM_STYLE}
        >
          {item.message}
        </Alert>
      ))}
    </div>
  );
}
