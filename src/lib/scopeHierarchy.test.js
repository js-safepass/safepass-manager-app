import { describe, expect, test } from 'vitest';
import { resolveScope, selectionUpTo, chooseScope } from './scopeHierarchy.js';

// Mapping-app level config: divisions/locations auto-select a lone option;
// building/floor always present a picker.
function levels({ divisions = [], locations = [], buildings = [], floors = [] }) {
  return [
    { key: 'division', label: 'Division', items: divisions, parentKey: null, parentField: null, autoSelectSingle: true },
    { key: 'location', label: 'Location', items: locations, parentKey: 'division', parentField: 'division_id', autoSelectSingle: true },
    { key: 'building', label: 'Building', items: buildings, parentKey: 'location', parentField: 'location_id', autoSelectSingle: false },
    { key: 'floor', label: 'Floor', items: floors, parentKey: 'building', parentField: 'building_id', nameField: 'label', autoSelectSingle: false },
  ];
}

const div = (id) => ({ id, name: id });
const loc = (id, division_id) => ({ id, name: id, division_id });
const bld = (id, location_id) => ({ id, name: id, location_id });
const flr = (id, building_id) => ({ id, label: id, building_id });

describe('resolveScope — auto-select-single above building', () => {
  test('single division + single location auto-select; building is the active step', () => {
    const L = levels({
      divisions: [div('d1')],
      locations: [loc('l1', 'd1')],
      buildings: [bld('b1', 'l1'), bld('b2', 'l1')],
      floors: [flr('f1', 'b1')],
    });
    const r = resolveScope(L, {});
    expect(r.resolved).toEqual({ division: 'd1', location: 'l1' });
    expect(r.steps.find((s) => s.key === 'division').auto).toBe(true);
    expect(r.steps.find((s) => s.key === 'location').auto).toBe(true);
    expect(r.activeKey).toBe('building'); // two buildings -> user must choose
    expect(r.complete).toBe(false);
  });

  test('building never auto-selects even with one option (always confirmed)', () => {
    const L = levels({
      divisions: [div('d1')],
      locations: [loc('l1', 'd1')],
      buildings: [bld('b1', 'l1')],
      floors: [flr('f1', 'b1'), flr('f2', 'b1')],
    });
    const r = resolveScope(L, {});
    expect(r.activeKey).toBe('building'); // one building, still shown
    expect(r.resolved.building).toBeUndefined();
  });

  test('multiple divisions -> division is the first active step (no auto-select)', () => {
    const L = levels({
      divisions: [div('d1'), div('d2')],
      locations: [loc('l1', 'd1')],
      buildings: [bld('b1', 'l1')],
    });
    const r = resolveScope(L, {});
    expect(r.activeKey).toBe('division');
    expect(r.steps).toHaveLength(1);
  });
});

describe('resolveScope — cascade and completion', () => {
  test('choosing building then floor completes the drill', () => {
    const L = levels({
      divisions: [div('d1')],
      locations: [loc('l1', 'd1')],
      buildings: [bld('b1', 'l1'), bld('b2', 'l1')],
      floors: [flr('f1', 'b1'), flr('f2', 'b1'), flr('fx', 'b2')],
    });
    const afterBuilding = resolveScope(L, { building: 'b1' });
    expect(afterBuilding.activeKey).toBe('floor');
    // Floor options are filtered to the chosen building.
    expect(afterBuilding.steps.find((s) => s.key === 'floor').options.map((o) => o.id)).toEqual(['f1', 'f2']);

    const done = resolveScope(L, { building: 'b1', floor: 'f2' });
    expect(done.complete).toBe(true);
    expect(done.activeKey).toBeNull();
    expect(done.resolved).toEqual({ division: 'd1', location: 'l1', building: 'b1', floor: 'f2' });
    expect(done.selectedItems.floor).toEqual(flr('f2', 'b1'));
  });

  test('location options are filtered by the chosen division', () => {
    const L = levels({
      divisions: [div('d1'), div('d2')],
      locations: [loc('lA', 'd1'), loc('lB', 'd1'), loc('lC', 'd2')],
      buildings: [bld('b1', 'lA')],
    });
    const r = resolveScope(L, { division: 'd1' });
    const locStep = r.steps.find((s) => s.key === 'location');
    expect(locStep.options.map((o) => o.id)).toEqual(['lA', 'lB']);
    expect(r.activeKey).toBe('location'); // two locations under d1
  });

  test('a building with no floors makes floor the active (empty) step, not complete', () => {
    const L = levels({
      divisions: [div('d1')], locations: [loc('l1', 'd1')],
      buildings: [bld('b1', 'l1')], floors: [flr('f1', 'bOther')],
    });
    const r = resolveScope(L, { building: 'b1' });
    expect(r.activeKey).toBe('floor');
    expect(r.steps.find((s) => s.key === 'floor').options).toEqual([]);
    expect(r.complete).toBe(false);
  });
});

describe('resolveScope — skipped (empty) levels collapse', () => {
  test('no divisions/locations feed: building filters against the org, not a phantom parent', () => {
    // App supplies only buildings + floors (divisions/locations empty) — the
    // building level must still show all org buildings, not filter to null.
    const L = levels({
      divisions: [], locations: [],
      buildings: [bld('b1', 'l1'), bld('b2', 'l2')],
      floors: [flr('f1', 'b1')],
    });
    const r = resolveScope(L, {});
    expect(r.steps.map((s) => s.key)).toEqual(['building']); // division/location skipped
    expect(r.steps[0].options.map((o) => o.id)).toEqual(['b1', 'b2']);
    expect(r.activeKey).toBe('building');
  });
});

describe('resolveScope — focusKey forces a single-option level to show its picker', () => {
  const L = levels({
    divisions: [div('d1')],           // single -> would normally auto-select
    locations: [loc('l1', 'd1')],
    buildings: [bld('b1', 'l1'), bld('b2', 'l1')],
  });

  test('without focus, the lone division auto-selects and building is active', () => {
    expect(resolveScope(L, {}).activeKey).toBe('building');
  });

  test('focusing the division makes it the active step despite one option', () => {
    const r = resolveScope(L, {}, { focusKey: 'division' });
    expect(r.activeKey).toBe('division');
    expect(r.steps.find((s) => s.key === 'division').options.map((o) => o.id)).toEqual(['d1']);
  });
});

describe('selectionUpTo / chooseScope — back navigation', () => {
  const L = levels({
    divisions: [div('d1'), div('d2')],
    locations: [loc('lA', 'd1'), loc('lC', 'd2')],
    buildings: [bld('b1', 'lA')],
    floors: [flr('f1', 'b1')],
  });

  test('selectionUpTo clears the target level and everything below it', () => {
    const sel = { division: 'd1', location: 'lA', building: 'b1', floor: 'f1' };
    expect(selectionUpTo(L, sel, 'location')).toEqual({ division: 'd1' });
    expect(selectionUpTo(L, sel, 'division')).toEqual({});
  });

  test('chooseScope re-picking a higher level drops stale lower selections', () => {
    const sel = { division: 'd1', location: 'lA', building: 'b1', floor: 'f1' };
    // Go back up and switch the division: location/building/floor are cleared.
    expect(chooseScope(L, sel, 'division', 'd2')).toEqual({ division: 'd2' });
  });
});
