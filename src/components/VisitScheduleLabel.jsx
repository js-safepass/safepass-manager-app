import { formatDateTime, formatRelative, formatTime } from '../lib/format/datetime.js';
import { upcomingBucket } from '../lib/upcomingVisits.js';

// Schedule label for a pending visit, shared by the Visits Upcoming table and
// the Dashboard "Arriving today" feed: today's arrivals read as a clock time
// plus relative distance ("10:30 AM · in 45 min"), turning red once overdue;
// other days as a short date. Unscheduled pending records are rare (desk
// check-ins go straight to checking_in) but must not vanish.
export default function VisitScheduleLabel({ visit }) {
  if (!visit?.start_time) return <span className="text-muted">Unscheduled</span>;
  const bucket = upcomingBucket(visit);
  if (bucket === 'later') {
    return <>{formatDateTime(visit.start_time, undefined, { length: 'short' })}</>;
  }
  return (
    <>
      {formatTime(visit.start_time)}
      <span className={bucket === 'overdue' ? 'text-danger' : 'text-muted'}>
        {' '}· {formatRelative(visit.start_time)}
      </span>
    </>
  );
}
