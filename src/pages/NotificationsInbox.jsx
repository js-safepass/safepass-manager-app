import { Badge, Button } from 'react-bootstrap';
import SectionCard from '../components/SectionCard.jsx';
import { useNotifications } from '../state/useNotifications.js';
import { useFlash } from '../lib/flashProvider.jsx';
import { getUserFacingError } from '../lib/userErrors.js';
import { formatDateTime } from '../lib/format/datetime.js';

const SEVERITY_ICON = {
  danger: 'fa-triangle-exclamation text-danger',
  warning: 'fa-circle-exclamation text-warning',
  info: 'fa-circle-info text-info',
};

// Notification inbox: shared feed state from NotificationsProvider (which
// also drives the sidebar unread badge). Unknown types render safely as
// plain rows — never branch UI on an unrecognized type.
export default function NotificationsInbox() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const flash = useFlash();

  const onMarkAll = async () => {
    try {
      await markAllRead();
    } catch (err) {
      flash.error(getUserFacingError(err));
    }
  };

  const onMark = async (id) => {
    try {
      await markRead(id);
    } catch (err) {
      flash.error(getUserFacingError(err));
    }
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0 d-flex align-items-center gap-2">
          Notifications
          {unreadCount > 0 && <Badge bg="primary">{unreadCount} unread</Badge>}
        </h4>
        <Button variant="outline-secondary" size="sm" onClick={onMarkAll} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      <SectionCard bodyClassName="p-0">
        {notifications.length === 0 ? (
          <div className="text-muted small py-4 text-center">No notifications.</div>
        ) : (
          <ul className="list-group list-group-flush mb-0">
            {notifications.map((n) => (
              <li key={n.id} className="list-group-item d-flex align-items-start gap-3 py-3">
                <i
                  className={`fas ${SEVERITY_ICON[n.severity] || 'fa-circle-info text-secondary'} mt-1`}
                  aria-hidden="true"
                />
                <div className="flex-grow-1">
                  <div className={n.read_at ? 'text-muted' : 'fw-semibold'}>{n.title}</div>
                  <div className="text-muted small">{formatDateTime(n.created_at)}</div>
                </div>
                {!n.read_at && (
                  <Button variant="link" size="sm" className="p-0" onClick={() => onMark(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
