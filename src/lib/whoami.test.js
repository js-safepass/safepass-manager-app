import { describe, expect, test } from 'vitest';
import { classifyWhoami, whoamiOrgIds } from './whoami.js';

const FULL = {
  user_id: 'u1',
  email: 'staff@example.com',
  principal: 'user',
  org_ids: ['org_1'],
  assignments: [{ role: 'front_desk', org_id: 'org_1' }],
  effective_permissions: {},
  evaluated_at: '2026-07-16T00:00:00Z',
};

describe('whoami shape handling', () => {
  test('whoamiOrgIds defaults to [] when org_ids is absent or malformed', () => {
    expect(whoamiOrgIds(FULL)).toEqual(['org_1']);
    expect(whoamiOrgIds({ org_ids: 'oops' })).toEqual([]);
    expect(whoamiOrgIds(null)).toEqual([]);
  });

  test('classifyWhoami: orgs granted -> ready', () => {
    expect(classifyWhoami(FULL)).toBe('ready');
  });

  test('classifyWhoami: authenticated but no orgs -> no_access', () => {
    expect(classifyWhoami({ org_ids: [] })).toBe('no_access');
    expect(classifyWhoami({ user_id: 'u1' })).toBe('no_access');
  });
});
