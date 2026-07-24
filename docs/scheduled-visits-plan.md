# Scheduled visits — surfacing the hidden workflow (plan of record)

> **Status:** **BUILT 2026-07-24** (scoped, greenlit, and steps 0–5 all
> landed the same day: PRs #56 Upcoming view, #57 Dashboard arrivals +
> `?open=` deep-link, #59 Schedule-visit form, #60 VisitorDetail scheduled
> awareness + scheduled-match preview, and the step-5 PR — reschedule +
> notification deep-links). Remaining: the **staging verification pass**
> after the backend release deploys (IN-list filters, scheduled-match live,
> expiry worker enabled) — see Acceptance.
> Backend prerequisites ride the **2026-07-24 deploy window** (owner-confirmed):
> `feat/visits-status-inlist` (PR #256) and `GET /v1/visitors/{id}/scheduled-match`
> (PR #251) are merged to backend `dev` on release PR #260, deploying
> backend-first per the locked order. Expiry worker will be enabled by ops if
> not already; `COGNITO_MANAGER_AUDIENCE` confirmed set in deployed envs.
>
> **Product ruling (owner, 2026-07-24):** the legacy app's approver/approval
> workflow is DEAD — "spotty at best" even in the old system, clients don't
> use it. Do not port approve/reject, approver routing, or a review queue.
> (The backend's visitor review gates — 428 `REVIEW_REQUIRED` on confirm,
> "Pending review" dashboard tile — are a separate live mechanism and stay.)
> Scheduled visits, by contrast, are a real workflow currently hidden behind
> check-in auto-matching, and get first-class UI per this plan.

## Why

`POST /v1/visitors/{id}/checkin` silently consumes the visitor's closest
matchable scheduled visit; nothing in the app shows scheduled visits before
that moment. The legacy RN app's core loop was invitation/scheduling-shaped —
this plan carries that value forward without the dead approval half.

## Wire truth (validated 2026-07-24 against sentinel-datamanager code, not specs)

Full findings in session notes; the load-bearing facts:

- **Per-visit check-in = `POST /v1/visits/{id}/confirm`** — 202 `{data}`,
  `pending|checking_in` → `checking_in` + queued async pipeline. Gates in
  order: 409 `VISITOR_CHECKIN_IN_PROGRESS`/`VISITOR_ALREADY_CHECKED_IN`,
  **428** `REVIEW_REQUIRED`, **428** `BACKGROUND_CHECK_REQUIRED` (clearable
  with body `{check_cleared:true}`), **428** `VISITOR_NOT_AVAILABLE`,
  400 `BUILDING_REQUIRED`, 503 `CHECKIN_UNAVAILABLE`, 429
  `CHECKIN_QUEUE_FULL`, 409 `NO_AVAILABLE_BADGES`. No early-check-in cap
  server-side; ineligible status (incl. `expired`) → generic 400.
  No If-Match on any visit action (server-side optimistic retry).
- **`GET /v1/visits`**: no time-window filters; `scheduled_start` is not a
  sortable column (default sort `-created_at`) → the Upcoming view fetches
  `status=pending` and sorts/windows client-side. Comma IN-lists for
  `status` land with backend PR #256 (before that, single value only).
- **`GET /v1/checkin/scheduled`**: per-visitor (org+location+visitor_id
  required), forces `status=pending`, **no date window** despite the
  "matchable" naming — client-side windowing needed.
- **`GET /v1/visitors/{id}/scheduled-match`** (backend PR #251): read-only
  preview of what a check-in would auto-claim — `{ matched, candidate_count,
  visit? }`, `location_id` required, org must match, advisory/racy by design
  (a kiosk can consume the match between preview and confirm). Front-desk
  weight (30) with 404-on-denial. Wired in sentinel-ui's CheckInModal
  (PR #366); manager app has no consumer yet — this plan adds one.
- **Auto-match criteria** (for UI copy): pending visits at same org+location
  whose window overlaps the current **local day** (location tz, org tz then
  UTC fallback); closest to now wins, in-progress always wins, 60-min grace
  after `scheduled_end`, unbounded before start, ties → later booking.
  Claim overwrites the visit's building/station with the check-in's.
- **`POST /v1/visits` (create)**: always creates `pending`; `start_time`
  optional and may be in the past (only `end > start` enforced, both
  handler- and domain-layer); host defaults from the linked visitor when
  omitted (visitor `host_contact_id` → `host_user_id` → meta fallbacks);
  `Idempotency-Key` is declared in OpenAPI but **ignored by the handler**
  (send it anyway — harmless, and correct if the backend later honors it).
  **`visitor_name`-only unlinked create is a spec mirage** — the handler
  drops the field; always link a real visitor. **`building_id` is not
  required at create but confirm 400s without it** — the form must always
  attach building from active scope (footgun acknowledged by owner;
  backend polish to follow).
- **Expiry**: pending → `expired` (terminal, recreate-only) at ~02:00 local
  the day after the visit's effective day (`COALESCE(end,start)`), location
  tz. Worker ships default-disabled; ops enabling it alongside this feature.
  Render `expired` like `cancelled`.
- **Notifications**: every row carries top-level `visit_id`/`visitor_id` —
  deep-link from those; **ignore `action_url`** (only set on
  `visit.checkin_failed.*` broadcasts and points at sentinel-ui routes).
- **App policy "G"**: every endpoint above is allowlisted (merged to main,
  PR #230; `scheduled-match` entry rides PR #260). Visitor update is PATCH
  (no PUT route) — `managerApi.updateVisitor` already correct.

## Build sequence

### Step 0 — status IN-list correctness (prerequisite bug fix)
The app already sends comma status lists (VisitsList "On site" and
cancelled-group options, VisitorsList presence join) which match **nothing**
until backend #256 deploys — masked by the mock, which implemented IN-lists.
After tonight's deploy this usage becomes correct. Work: verify against
staging once deployed, add a dated comment at the send sites pinning the
IN-list dependency (backend #256 / release #260), and align mock behavior
notes. No wire change expected if the deploy lands first; if this app must
ship ahead of it, fall back to sentinel-ui's pattern (#368/#370): single
status on the wire + client-side IN-set narrowing.

### Step 1 — "Upcoming" in the Visits tab
Segmented control (Upcoming / On site / History) replacing the flat filter
dropdown. Upcoming = `listVisits({status:'pending', location_id, building_id})`,
client-sorted by `start_time` (nulls last), grouped Today / Later / **Overdue**
(start in the past — visible rather than hidden, since expiry only sweeps at
~02:00 next day). Columns: visitor, scheduled time (relative for today),
host. Row tap → existing VisitActionModal where **Confirm is relabeled
"Check in"** for pending visits, with full gate handling: 428 codes mapped in
`userErrors.js`, `BACKGROUND_CHECK_REQUIRED` prompting a check-cleared
confirm, 409/429 as warnings. `expired` renders like `cancelled` everywhere.
Pull-to-refresh on the list (legacy port; the gesture is expected here).

### Step 2 — Dashboard "Arriving today" feed
Notifications-feed-style card: next ~5 of today's pending visits at active
scope, client-side count (metrics shapes still provisional — decision #10),
tap → modal, "View all" → Upcoming. Shares step 1's fetch/sort lib module
(pure logic in `src/lib/`, unit-tested per convention).

### Step 3 — "Schedule visit" create UI
Entry points: Visits tab button, VisitorDetail action, Dashboard quick
action. Modal: visitor search-and-pick (create-new branches into
VisitorFormModal first — **visitor record always required**, D1 above),
start date/time (min = now in UI even though the wire allows past), optional
end (validate end > start client-side to match the server), location +
**building always from active scope** (BUILDING_REQUIRED footgun). Host
fields deliberately omitted — backend defaults host from the linked visitor;
host attach remains Phase 2. Legacy ergonomics ride along: date/time
stepping, phone formatting on the visitor form.

### Step 4 — VisitorDetail scheduled awareness + match preview
- "Upcoming visits" section via `listScheduledCheckins` (client-windowed,
  soonest first), each row offering Check in (confirm) / Cancel.
- Add `getScheduledMatch(visitorId, {location_id, org_id})` to `managerApi`;
  before the walk-up **Check in** button fires, preview: if `matched`, show
  "This will check in their {time} scheduled visit" (turning today's silent
  auto-claim into informed UX). Advisory only — never gate on it, races are
  expected; the checkin/confirm response remains authoritative.

### Step 5 — Reschedule + notification deep-links
- Reschedule on pending visits = prefilled create (step 3 form) + cancel the
  old visit **after** successful create (create-then-cancel, so a failure
  never strands the visitor with nothing).
- Notification rows navigate from `visit_id`/`visitor_id` (visit → visits
  surface + modal; visitor → detail page); mark-read on open. Ignore
  `action_url`.

## Out of scope (unchanged decisions)
Approval/review workflow (dead, see Status), host attach + suggest
(Phase 2), station picker + preflight (Phase 3), photos (Phase 5), visit
edit endpoint (backend "remove, don't build" 2026-07-12 — reschedule is
cancel+recreate), prev/next detail paging (nice-to-have, unscheduled).

## Acceptance
Full loop on staging against the real backend: schedule tomorrow's visit →
it appears in Upcoming + Arriving today (on the right day) → check it in
from the row (badge pipeline completes) → a second scheduled visit for the
same visitor shows the match preview on walk-up check-in → reschedule and
cancel paths work → an unattended pending visit goes `expired` overnight and
renders as such. Mock stays drivable end-to-end (seeded future-pending
visits, expired seed, scheduled-match simulation).
