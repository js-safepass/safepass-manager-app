import { describe, expect, test } from 'vitest';
import { formatPhoneInput } from './phoneFormat.js';

describe('formatPhoneInput', () => {
  test('formats digits progressively as (xxx) xxx-xxxx', () => {
    expect(formatPhoneInput('5')).toBe('(5');
    expect(formatPhoneInput('555')).toBe('(555');
    expect(formatPhoneInput('5551')).toBe('(555) 1');
    expect(formatPhoneInput('5551234')).toBe('(555) 123-4');
    expect(formatPhoneInput('5551234567')).toBe('(555) 123-4567');
  });

  test('reformats pasted/partially formatted input and caps at 10 digits', () => {
    expect(formatPhoneInput('555-123-4567')).toBe('(555) 123-4567');
    expect(formatPhoneInput('(555) 123-45678999')).toBe('(555) 123-4567');
  });

  test('leaves international numbers alone', () => {
    expect(formatPhoneInput('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhoneInput(' +1 555 555 0100')).toBe(' +1 555 555 0100');
  });

  test('empty input stays empty', () => {
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput(null)).toBe('');
    expect(formatPhoneInput('abc')).toBe('');
  });
});
