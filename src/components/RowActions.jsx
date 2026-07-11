import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Overlay, OverlayTrigger, Tooltip } from 'react-bootstrap';

/**
 * Unified row actions component for SimpleTable action columns.
 *
 * Renders actions as inline buttons up to `maxVisible`, then overflows
 * the rest into a dropdown. Actions are sorted by `priority` (lower = more prominent).
 * Inside the overflow dropdown, actions are visually grouped by their `group` string
 * with dividers between groups. Danger actions sort last within their group.
 *
 * Usage:
 *   <RowActions
 *     actions={[
 *       { key: 'view', label: 'View', onClick: () => navigate(`/visitor/${row.id}`) },
 *       { key: 'edit', label: 'Edit', onClick: () => handleEdit(row), group: 'modify' },
 *       { key: 'delete', label: 'Delete', variant: 'danger', group: 'modify',
 *         onClick: () => handleDelete(row) },
 *     ]}
 *     maxVisible={2}
 *   />
 *
 * @param {object} props
 * @param {Action[]} props.actions — action definitions (see below)
 * @param {number} [props.maxVisible=2] — max inline buttons before overflow dropdown
 * @param {'sm'|'md'} [props.size='sm'] — button size
 * @param {string} [props.overflowLabel] — label for the overflow dropdown toggle (default: "•••")
 *
 * Action shape:
 *   key          — unique identifier (required)
 *   label        — button/item text (required)
 *   onClick      — handler (required)
 *   variant      — Bootstrap variant: 'primary'|'secondary'|'success'|'danger'|'dark'
 *                   (default: 'outline-secondary' for buttons, 'text-danger' for danger items in dropdown)
 *   icon         — FontAwesome class string, e.g. 'fas fa-pen' (optional)
 *   priority     — sort order, lower = more prominent (default: 5)
 *   group        — grouping key for overflow dropdown clustering (optional)
 *   show         — if false, action is hidden entirely (default: true)
 *   disabled     — if true, action is disabled (default: false)
 *   disabledTitle — tooltip text when disabled (optional)
 *   loading      — if true, show loading state (default: false)
 *   loadingLabel — text during loading (default: label + '…')
 *   href         — if set, render as Link/anchor instead of button (optional)
 */

const DEFAULT_PRIORITY = 5;

function sortActions(actions) {
  return [...actions].sort((a, b) => {
    const pa = a.priority ?? DEFAULT_PRIORITY;
    const pb = b.priority ?? DEFAULT_PRIORITY;
    if (pa !== pb) return pa - pb;
    // Within same priority, danger items sort last
    if (a.variant === 'danger' && b.variant !== 'danger') return 1;
    if (b.variant === 'danger' && a.variant !== 'danger') return -1;
    return 0;
  });
}

function buttonVariant(action) {
  if (action.variant === 'danger') return 'outline-danger';
  if (action.variant === 'primary') return 'outline-primary';
  if (action.variant === 'success') return 'outline-success';
  if (action.variant === 'dark') return 'outline-dark';
  return 'outline-secondary';
}

export function ActionButton({ action, size }) {
  const isDisabled = action.disabled || action.loading;
  const label = action.loading ? (action.loadingLabel || `${action.label}…`) : action.label;

  const btn = (
    <Button
      size={size}
      variant={buttonVariant(action)}
      disabled={isDisabled}
      onClick={action.onClick}
      title={isDisabled && action.disabledTitle ? action.disabledTitle : undefined}
    >
      {action.icon && <i className={`${action.icon} me-1`} aria-hidden="true" />}
      {label}
    </Button>
  );

  if (isDisabled && action.disabledTitle) {
    return (
      <OverlayTrigger placement="top" overlay={<Tooltip>{action.disabledTitle}</Tooltip>}>
        <span>{btn}</span>
      </OverlayTrigger>
    );
  }

  return btn;
}

export function OverflowDropdown({ actions, size, overflowLabel }) {
  // Group actions by their group key, preserving sort order
  const grouped = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    for (const action of actions) {
      const key = action.group || '__ungrouped__';
      if (!groupMap.has(key)) {
        const items = [];
        groupMap.set(key, items);
        groups.push({ key, items });
      }
      groupMap.get(key).push(action);
    }

    // Within each group, sort danger items last
    for (const g of groups) {
      g.items.sort((a, b) => {
        if (a.variant === 'danger' && b.variant !== 'danger') return 1;
        if (b.variant === 'danger' && a.variant !== 'danger') return -1;
        return 0;
      });
    }

    return groups;
  }, [actions]);

  const [show, setShow] = useState(false);
  const toggleRef = useRef(null);
  const menuRef = useRef(null);

  // Close on outside click / Escape. The menu is portaled to <body> (see below),
  // so it lives outside the toggle's DOM subtree — track both refs explicitly
  // rather than relying on a single container. We attach the listener only while
  // open, after the opening click has already settled, so it never self-closes.
  useEffect(() => {
    if (!show) return undefined;
    const onDocMouseDown = (e) => {
      if (toggleRef.current?.contains(e.target)) return; // toggle manages itself
      if (menuRef.current?.contains(e.target)) return;   // click landed in the menu
      setShow(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setShow(false); };
    // Close on scroll / resize. The menu is anchored to the row's button, so
    // without this it drifts across the page as the row scrolls (Popper keeps it
    // glued to a reference that's moving). Closing on scroll is the standard
    // dropdown behavior and avoids freezing the page. capture:true catches
    // scrolls on inner scroll containers (the table's panes), which don't bubble.
    const onScrollOrResize = () => setShow(false);
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [show]);

  // The actions column lives inside SimpleTable's right pinned pane, which sets
  // `overflow: hidden` and its own stacking context (zIndex). An in-DOM menu —
  // even one positioned with `strategy: 'fixed'` — gets clipped, rendered
  // off-anchor (off-screen to the right), or hidden behind sticky chrome,
  // because Popper still resolves against that pane's scroll/stacking context.
  // Rendering the menu in a PORTAL to <body> (`container`) takes it out of the
  // pane entirely, so positioning is reliable regardless of overflow/transform/
  // z-index. `placement="bottom-end"` opens it leftward, anchored to the
  // toggle's right edge (so it can't run off the right viewport edge); `flip`
  // lifts it up near the bottom; a dropdown-grade z-index keeps it above chrome.
  return (
    <>
      <Button
        ref={toggleRef}
        variant="outline-secondary"
        size={size}
        active={show}
        aria-haspopup="true"
        aria-expanded={show}
        onClick={() => setShow((s) => !s)}
      >
        {overflowLabel || '•••'}
      </Button>
      <Overlay
        show={show}
        target={toggleRef.current}
        placement="bottom-end"
        flip
        transition={false}
        container={typeof document !== 'undefined' ? document.body : undefined}
        popperConfig={{ strategy: 'fixed' }}
      >
        {(overlayProps) => (
          // Read only ref + style off Popper's injected props (the rest —
          // placement/arrowProps/popper/etc. — aren't valid DOM attrs). Merge
          // Popper's ref with our own so positioning AND outside-click both work.
          <div
            ref={(node) => {
              menuRef.current = node;
              const r = overlayProps.ref;
              if (typeof r === 'function') r(node);
              else if (r && typeof r === 'object') r.current = node;
            }}
            className="dropdown-menu show"
            style={{ ...overlayProps.style, zIndex: 2000 }}
          >
            {grouped.map((group, gi) => (
              <span key={group.key}>
                {gi > 0 && <div className="dropdown-divider" />}
                {group.items.map((action) => {
                  const isDisabled = action.disabled || action.loading;
                  const label = action.loading ? (action.loadingLabel || `${action.label}…`) : action.label;

                  return (
                    <button
                      type="button"
                      key={action.key}
                      className={`dropdown-item${action.variant === 'danger' ? ' text-danger' : ''}`}
                      disabled={isDisabled}
                      title={isDisabled && action.disabledTitle ? action.disabledTitle : undefined}
                      onClick={() => { setShow(false); action.onClick?.(); }}
                    >
                      {action.icon && <i className={`${action.icon} me-1`} aria-hidden="true" />}
                      {label}
                    </button>
                  );
                })}
              </span>
            ))}
          </div>
        )}
      </Overlay>
    </>
  );
}

const RowActions = ({ actions, maxVisible = 2, size = 'sm', overflowLabel }) => {
  const visible = useMemo(() => {
    // Filter out hidden actions, then sort by priority
    const shown = (actions || []).filter((a) => a.show !== false);
    return sortActions(shown);
  }, [actions]);

  if (visible.length === 0) return null;

  // If everything fits inline, just render buttons
  if (visible.length <= maxVisible) {
    return (
      <div className="d-flex gap-1 align-items-center">
        {visible.map((action) => (
          <ActionButton key={action.key} action={action} size={size} />
        ))}
      </div>
    );
  }

  // Split into inline buttons + overflow dropdown
  const inline = visible.slice(0, maxVisible);
  const overflow = visible.slice(maxVisible);

  return (
    <div className="d-flex gap-1 align-items-center">
      {inline.map((action) => (
        <ActionButton key={action.key} action={action} size={size} />
      ))}
      <OverflowDropdown actions={overflow} size={size} overflowLabel={overflowLabel} />
    </div>
  );
};

export default RowActions;
