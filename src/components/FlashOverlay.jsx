// FlashOverlay.jsx
//
// Fixed-position toast stack for flash notifications.
// Renders in the top-right corner, above all page content.
// Consumed automatically by FlashProvider — mount once in the app layout.

import { Alert } from 'react-bootstrap';
import { useFlash } from '../lib/flashProvider';

const OVERLAY_STYLE = {
  position: 'fixed',
  top: '1rem',
  right: '1rem',
  zIndex: 1080, // above Bootstrap modals (1050) and navbars
  maxWidth: '28rem',
  width: '100%',
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
