# Scope-widget unification — spec (PROPOSED, for review)

> **Status:** PROPOSED 2026-07-23. Design/contract only — no code until
> reviewed. Unification means ONE behavior + visual contract applied
> per-repo (D12 copy-per-app; no shared package exists).

## Current state (audited)
| | Manager (`/scope` ScopePicker) | Mapping (ScopePicker) |
|---|---|---|
| Drill | org → division → location → building (terminal) | same drill + **floor** (terminal) |
| Auto-select | single-child tiers above building auto-advance | same rule (both derive from the same 2026-07-13 port) |
| Persistence | `safepass.activeOrgId` + per-org `safepass.scope.<orgId>` (localStorage) | **none** — scope is App state, lost on reload (visible post-session-restore: operator re-picks the floor) |
| Entry points | topbar scope chain link + profile-menu "Change scope" | app-bar; `feat/bottom-nav` commit `9f3708f` adds per-tier editing + an explicit app-bar caret (prior art) |
| Presentation | routed page, breadcrumb, cursor-drained lists | full-screen page, same list mechanics |

## Target contract (proposal)
1. **One drill component-behavior**: breadcrumb header (each crumb tappable to
   re-open that tier), cursor-drained tier lists, auto-select-single above
   building, terminal tier differs per app (building vs floor).
2. **Per-tier editing everywhere** (adopt `9f3708f`'s model): tapping a crumb
   edits THAT tier without restarting the drill.
3. **Persistence parity**: mapping adopts manager's keys —
   `safepass.activeOrgId` + `safepass.scope.<orgId>` (extended with `floorId`/
   `floorName`) — so a session restore lands the operator back on their floor
   (closes the Tier-3 "remembered scope" item). Reconcile-on-load: persisted
   scope validated against grants/fetch; invalid tiers drop to the deepest
   valid one.
4. **Entry point parity**: scope chain visible in the app bar (tap = drill at
   that tier) + "Change scope" in the unified profile menu; mapping's caret
   affordance carries over to manager.
5. **Visual parity**: same tier colors (`--sp-scope-*` tokens exist in
   mapping; manager adopts the same palette), same list-row and breadcrumb
   styling per each app's design system.

## Open questions (answer before build)
- Q-A: When a persisted mapping floor no longer exists (deleted/renamed),
  land on the building tier with a toast, or silently at the deepest valid
  tier?
  A: Run back up the scope chan to the nearest valid point and show a toast
- Q-B: Manager's routed `/scope` vs mapping's stateful full-screen — keep
  each app's navigation idiom (recommended) or force one?
  A: Both selector methods are valid and interesting. One thing, the manager app could theoretically bail early (for example if you want to monitor for a whole location or org) - We can unify the feel of these flows, but the function likely will need to diverge a little bit.
- Q-C: Does per-tier editing need a "clear below this tier" affordance, or
  does re-picking a tier implicitly clear descendants (recommended:
  implicit)?
  A: Implicit clear, changing a higher value changes possible inheritance, a floor of building B is not valid if building is changed to C, and building B and C may be at different locations etc.

## Additional items to unify
- Toasts/alerts should behave the same on both apps
- Toasts and alerts can be too wide (overflow left) and also float too high (overlap unsafe areas)
  realistically both should be fixed

## Sequencing
Depends on the `feat/bottom-nav` revive (it carries `9f3708f`). Build order:
revive first (mapping), then this contract lands as one PR per app.
Estimate: ~4–6h mapping (mostly persistence + crumb editing), ~3–4h manager
(caret + per-tier editing + palette).

## Unrelated items to stage
- Visits page in Manager App
  - Visits should also show start/end times in the initial table
  - The visit inspect on click should show more data (host, times, etc - right now the times are blank for example)
- Visitors page in Manager App
  - The visitors filters should also filter for the state/status column that handles checked in etc conditions - the current status column is primarily a lifecycle concern and honestly can be hidden in an advanced filters area and default to available filtering. Reference the API specs for more clarity on this as it is somewhat confusing
- Notification page in Manager App
  - Clicking a notification in the list should open an expand that shows full details - also marking read on exit from that modal
  - If filtering is available in the API, we should consider adding it here (optional, keep muted)
- Dashboard in Manager App
  - We should probably retire the pending review card for an Available Badges card - we can also do a display like 43/60 shogin currently available and total capacity - not critical
  - Todays Visits quick action does not filter the all visits view properly - it should show all scheduled active and past visits FOR THAT DAY only, not even a hard 24h lookback, but reset at midnight for the location or user timezone
  - We might want to add a timezone setting to just the manager app user profile menu dropdown, like the UI has - willing to discuss
  - 