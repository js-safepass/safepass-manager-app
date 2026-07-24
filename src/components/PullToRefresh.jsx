import { useEffect, useRef, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { tapLight } from '../lib/native/haptics.js';

// Touch pull-to-refresh for page-level lists (legacy-app parity — the RN app
// had it on every list, and on phones staff reach for the gesture; the polled
// lists otherwise offer no manual refresh at all). Touch-only by design:
// desktop/mouse never triggers, so web keeps its current behavior.
//
// Works against PAGE scroll (window.scrollY), not an inner scroll container —
// AppLayout scrolls the document. The pull only arms when the page is at the
// very top; while visibly pulling we preventDefault (non-passive listener) so
// the WebView's native rubber-band doesn't fight the indicator.
const THRESHOLD = 70; // px of (resisted) pull that arms the refresh
const MAX_PULL = 110;
const HOLD = 44; // indicator height while the refresh runs

export default function PullToRefresh({ onRefresh, disabled = false, children }) {
  const wrapRef = useRef(null);
  const stateRef = useRef({ startY: 0, active: false, dy: 0 });
  const [dy, setDy] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || disabled) return undefined;
    const s = stateRef.current;

    const setPull = (value) => {
      s.dy = value;
      setDy(value);
    };

    const onTouchStart = (e) => {
      if (refreshing || e.touches.length !== 1 || window.scrollY > 0) return;
      s.startY = e.touches[0].clientY;
      s.active = true;
    };
    const onTouchMove = (e) => {
      if (!s.active || refreshing) return;
      const delta = e.touches[0].clientY - s.startY;
      if (delta <= 0 || window.scrollY > 0) {
        if (s.dy) setPull(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      setPull(Math.min(MAX_PULL, delta * 0.5)); // 0.5 = pull resistance
    };
    const finish = async () => {
      if (!s.active) return;
      s.active = false;
      if (s.dy < THRESHOLD || refreshing) {
        setPull(0);
        return;
      }
      tapLight(); // gesture armed — outcome feedback belongs to the caller
      setRefreshing(true);
      setPull(HOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    };
    const cancel = () => {
      s.active = false;
      if (!refreshing) setPull(0);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', finish);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finish);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [disabled, refreshing, onRefresh]);

  return (
    <div ref={wrapRef}>
      <div
        className="d-flex align-items-center justify-content-center"
        aria-live="polite"
        style={{
          height: dy,
          overflow: 'hidden',
          // Snap open/closed only when the finger is off; track it live mid-pull.
          transition: stateRef.current.active ? 'none' : 'height 150ms ease-out',
        }}
      >
        <Spinner
          animation="border"
          size="sm"
          role={refreshing ? 'status' : undefined}
          style={{ opacity: refreshing ? 1 : Math.min(1, dy / THRESHOLD) }}
        />
      </div>
      {children}
    </div>
  );
}
