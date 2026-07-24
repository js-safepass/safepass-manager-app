import { describe, expect, test } from 'vitest';
import { hostContactName } from './visitHost.js';

describe('hostContactName', () => {
  test('prefers the freeform name', () => {
    expect(hostContactName({ name: 'Dana Whitfield', first_name: 'X' })).toBe('Dana Whitfield');
  });
  test('joins first/last when no freeform name', () => {
    expect(hostContactName({ first_name: 'Ravi', last_name: 'Chandra' })).toBe('Ravi Chandra');
    expect(hostContactName({ last_name: 'Chandra' })).toBe('Chandra');
  });
  test('null for missing/empty contact', () => {
    expect(hostContactName(null)).toBe(null);
    expect(hostContactName({ email: 'a@b.c' })).toBe(null);
  });
});
