// Scope drill-down resolver — framework-free and portable across SafePass
// apps (mapping, manager). The ordered levels + already-fetched entity arrays
// go in; the auto-select / cascade / active-step decisions come out. No React,
// no API — the component owns fetching and rendering, this owns the rules.
//
// Adapted from sentinel-ui's scopeProvider (2026-07-13): fetch the flat tree
// once, filter children client-side by the resolved parent, auto-select a
// level that has exactly one option, and cascade-reset everything below a
// changed selection. Reduced to pure functions so it drops into either app
// and is exhaustively unit-tested.
//
// Level descriptor (ordered top -> down):
//   {
//     key,               // unique id: 'division' | 'location' | 'building' | 'floor' | ...
//     label,             // singular human label: 'Division'
//     items,             // flat array of entities at this level (already org-scoped)
//     parentKey,         // the level key of this level's parent (null for the top)
//     parentField,       // the FK field on THIS level's items -> parent id
//     idField = 'id',    // entity id field
//     nameField = 'name',// entity display field (floors use 'label')
//     autoSelectSingle,  // default true. false => ALWAYS present a picker (even
//                        //   for one option) — building/floor: the operator
//                        //   always confirms what they're calibrating.
//   }
//
// A level whose `items` is empty is treated as NOT APPLICABLE to this app and
// skipped (mapping without a divisions feed, manager without floors) — its
// child level then filters against the nearest RESOLVED ancestor instead, so a
// missing middle tier collapses cleanly.

const DEFAULT_ID = 'id';

// Resolve the drill-down for the given explicit `selection` ({ [key]: id }).
// `focusKey` forces that level to present its picker even when it has a single
// option that would otherwise auto-select — set when the user clicks a
// breadcrumb to jump back to a level and re-choose.
// Returns:
//   steps         [{ key, label, options, selectedId, selectedItem, auto }]
//                 in walk order — resolved levels plus (last) the active one.
//   activeKey     the first level needing a user choice (null when fully resolved)
//   resolved      { [key]: id } including auto-selected levels
//   selectedItems { [key]: item }
//   complete      true when every applicable level is resolved (no active step)
export function resolveScope(levels, selection = {}, { focusKey = null } = {}) {
  const steps = [];
  const resolved = {};
  const selectedItems = {};
  let activeKey = null;

  for (const level of levels) {
    const idField = level.idField || DEFAULT_ID;
    const items = level.items || [];
    if (items.length === 0) continue; // level not used by this app -> skip

    // Filter to the children of the resolved parent. If the parent level was
    // skipped/unresolved, don't filter — the items are already org-scoped.
    const parentId = level.parentKey ? resolved[level.parentKey] : undefined;
    const options = (level.parentField && parentId != null)
      ? items.filter((it) => it[level.parentField] === parentId)
      : items;

    const chosenId = selection[level.key];
    const chosenValid = chosenId != null && options.some((o) => o[idField] === chosenId);
    // A focused level always presents its picker (no silent auto-select), so
    // the user can re-choose even a lone option they landed on via breadcrumb.
    const autoSelectSingle = level.autoSelectSingle !== false && level.key !== focusKey;

    let selectedId = null;
    let auto = false;
    if (chosenValid) {
      selectedId = chosenId;
    } else if (autoSelectSingle && options.length === 1) {
      selectedId = options[0][idField];
      auto = true;
    }

    const selectedItem = selectedId != null
      ? (options.find((o) => o[idField] === selectedId) || null)
      : null;

    steps.push({ key: level.key, label: level.label, options, selectedId, selectedItem, auto });

    if (selectedId == null) {
      // First unresolved level -> the wizard's active step. Lower levels
      // depend on this choice, so stop walking.
      activeKey = level.key;
      break;
    }
    resolved[level.key] = selectedId;
    selectedItems[level.key] = selectedItem;
  }

  const complete = activeKey === null && steps.length > 0;
  return { steps, activeKey, resolved, selectedItems, complete };
}

// Selection keeping every level ABOVE `levelKey`, clearing `levelKey` and
// below — the cascade reset used when the user goes back up to change a level.
export function selectionUpTo(levels, selection, levelKey) {
  const out = {};
  for (const level of levels) {
    if (level.key === levelKey) break;
    if (selection[level.key] != null) out[level.key] = selection[level.key];
  }
  return out;
}

// Apply a choice at `levelKey`, dropping any now-stale lower selections.
export function chooseScope(levels, selection, levelKey, id) {
  return { ...selectionUpTo(levels, selection, levelKey), [levelKey]: id };
}
