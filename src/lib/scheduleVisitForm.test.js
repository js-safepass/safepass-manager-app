import { describe, expect, test } from 'vitest';
import {
  defaultStartValue,
  fromDatetimeLocalValue,
  minStartValue,
  toDatetimeLocalValue,
  validateSchedule,
} from './scheduleVisitForm.js';

const NOW = new Date(2026, 6, 24, 12, 0, 0).getTime();

describe('datetime-local round trip', () => {
  test('toDatetimeLocalValue renders local wall time', () => {
    expect(toDatetimeLocalValue(NOW)).toBe('2026-07-24T12:00');
  });

  test('fromDatetimeLocalValue treats the value as local and emits ISO', () => {
    const iso = fromDatetimeLocalValue('2026-07-24T12:00');
    expect(new Date(iso).getTime()).toBe(NOW);
    expect(iso.endsWith('Z')).toBe(true);
  });

  test('empty or garbage input maps to null', () => {
    expect(fromDatetimeLocalValue('')).toBe(null);
    expect(fromDatetimeLocalValue(null)).toBe(null);
    expect(fromDatetimeLocalValue('not-a-date')).toBe(null);
  });
});

describe('defaultStartValue', () => {
  test('one hour out, rounded up to the next 5-minute step', () => {
    expect(defaultStartValue(NOW)).toBe('2026-07-24T13:00');
    expect(defaultStartValue(NOW + 61_000)).toBe('2026-07-24T13:05');
  });
});

describe('minStartValue', () => {
  test('floors to the 5-minute grid so round times stay step-valid', () => {
    expect(minStartValue(NOW)).toBe('2026-07-24T12:00');
    expect(minStartValue(NOW + 7 * 60_000)).toBe('2026-07-24T12:05');
  });
});

describe('validateSchedule', () => {
  const at = (mins) => toDatetimeLocalValue(NOW + mins * 60_000);

  test('requires a start', () => {
    expect(validateSchedule({ start: '', nowMs: NOW })).toMatch(/start/i);
  });

  test('rejects past starts beyond the grace window, allows within it', () => {
    expect(validateSchedule({ start: at(-10), nowMs: NOW })).toMatch(/past/i);
    expect(validateSchedule({ start: at(-4), nowMs: NOW })).toBe(null);
  });

  test('end must be after start; optional otherwise', () => {
    expect(validateSchedule({ start: at(60), end: at(30), nowMs: NOW })).toMatch(/after/i);
    expect(validateSchedule({ start: at(60), end: at(60), nowMs: NOW })).toMatch(/after/i);
    expect(validateSchedule({ start: at(60), end: at(120), nowMs: NOW })).toBe(null);
    expect(validateSchedule({ start: at(60), nowMs: NOW })).toBe(null);
  });
});
