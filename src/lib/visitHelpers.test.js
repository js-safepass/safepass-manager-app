import { describe, expect, test } from 'vitest';
import {
  isCheckoutEligible,
  isConfirmEligible,
  isTerminalVisit,
  visitStateForStatus,
} from './visitHelpers.js';

describe('isTerminalVisit', () => {
  test('completed, failed, cancelled and expired are terminal', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'expired']) {
      expect(isTerminalVisit({ status })).toBe(true);
    }
  });

  test('live and pending statuses are not terminal', () => {
    for (const status of ['pending', 'checking_in', 'active', 'checking_out']) {
      expect(isTerminalVisit({ status })).toBe(false);
    }
    expect(isTerminalVisit(undefined)).toBe(false);
  });
});

describe('visitStateForStatus', () => {
  test('expired maps to the completed bucket like cancelled', () => {
    expect(visitStateForStatus('expired')).toBe('completed');
    expect(visitStateForStatus('cancelled')).toBe('completed');
  });
});

describe('isConfirmEligible', () => {
  test('pending only', () => {
    expect(isConfirmEligible({ status: 'pending' })).toBe(true);
    for (const status of ['checking_in', 'active', 'expired', 'cancelled']) {
      expect(isConfirmEligible({ status })).toBe(false);
    }
  });
});

describe('isCheckoutEligible', () => {
  test('terminal statuses (incl. expired) are never checkout-eligible', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'expired']) {
      expect(isCheckoutEligible({ status, checkin_status: 'confirmed' })).toBe(false);
    }
  });

  test('active / checking_out / confirmed pipeline are eligible', () => {
    expect(isCheckoutEligible({ status: 'active' })).toBe(true);
    expect(isCheckoutEligible({ status: 'checking_out' })).toBe(true);
    expect(isCheckoutEligible({ status: 'checking_in', checkin_status: 'confirmed' })).toBe(true);
  });
});
