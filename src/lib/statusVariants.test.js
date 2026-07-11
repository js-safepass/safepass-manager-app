import { describe, it, expect } from 'vitest';
import { statusVariant } from './statusVariants.js';

describe('statusVariant', () => {
  it('maps the expired no-show terminal status to neutral grey (not danger)', () => {
    // expired is backend cleanup of un-checked-in scheduled visits — a quiet
    // system close, deliberately distinct from operator-flagged cancelled.
    expect(statusVariant('expired')).toBe('secondary');
    expect(statusVariant('cancelled')).toBe('danger');
  });

  it('is case-insensitive', () => {
    expect(statusVariant('EXPIRED')).toBe('secondary');
    expect(statusVariant('Active')).toBe('success');
  });

  it('falls back to secondary for unknown statuses', () => {
    expect(statusVariant('totally-made-up')).toBe('secondary');
    expect(statusVariant('')).toBe('secondary');
    expect(statusVariant(undefined)).toBe('secondary');
  });
});
