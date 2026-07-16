import { describe, expect, test } from 'vitest';
import { classifyWhoami, isWhoamiMfaGated, whoamiOrgIds } from './whoami.js';

const FULL = {
  user_id: 'u1',
  email: 'staff@example.com',
  principal: 'user',
  org_ids: ['org_1'],
  assignments: [{ role: 'front_desk', org_id: 'org_1' }],
  effective_permissions: {},
  mfa_required: true,
  mfa_satisfied: true,
  evaluated_at: '2026-07-16T00:00:00Z',
};

// The trimmed shape: identity + MFA flags only, NO authz surface.
const TRIMMED = {
  user_id: 'u1',
  email: 'staff@example.com',
  principal: 'user',
  mfa_required: true,
  mfa_satisfied: false,
  evaluated_at: '2026-07-16T00:00:00Z',
};

describe('whoami shape handling', () => {
  test('isWhoamiMfaGated is true only for required-and-not-satisfied', () => {
    expect(isWhoamiMfaGated(TRIMMED)).toBe(true);
    expect(isWhoamiMfaGated(FULL)).toBe(false); // satisfied
    expect(isWhoamiMfaGated({ mfa_required: false })).toBe(false);
    expect(isWhoamiMfaGated(null)).toBe(false);
  });

  test('whoamiOrgIds tolerates the trimmed shape (org_ids absent)', () => {
    expect(whoamiOrgIds(FULL)).toEqual(['org_1']);
    expect(whoamiOrgIds(TRIMMED)).toEqual([]); // absent -> [], not a crash
    expect(whoamiOrgIds(null)).toEqual([]);
  });

  test('classifyWhoami: trimmed -> mfa_required (never misread as no_access)', () => {
    expect(classifyWhoami(TRIMMED)).toBe('mfa_required');
  });

  test('classifyWhoami: full with orgs -> ready', () => {
    expect(classifyWhoami(FULL)).toBe('ready');
  });

  test('classifyWhoami: authenticated, satisfied, but no orgs -> no_access', () => {
    expect(classifyWhoami({ org_ids: [], mfa_required: false })).toBe('no_access');
    expect(classifyWhoami({ mfa_required: true, mfa_satisfied: true })).toBe('no_access');
  });
});
