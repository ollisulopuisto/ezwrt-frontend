import { describe, it, expect } from 'vitest';
import { escapeWifiString } from './wifi';

describe('escapeWifiString', () => {
  it('escapes special characters \\, ;, ,, :, and "', () => {
    expect(escapeWifiString('My;Network')).toBe('My\\;Network');
    expect(escapeWifiString('My,Network')).toBe('My\\,Network');
    expect(escapeWifiString('My:Network')).toBe('My\\:Network');
    expect(escapeWifiString('My\\Network')).toBe('My\\\\Network');
    expect(escapeWifiString('My"Network"')).toBe('My\\"Network\\"');
  });

  it('escapes multiple special characters in a single string', () => {
    expect(escapeWifiString('Pass:word;with,special\\chars"')).toBe(
      'Pass\\:word\\;with\\,special\\\\chars\\"'
    );
  });

  it('leaves normal alphanumeric strings unchanged', () => {
    expect(escapeWifiString('HomeNetwork123')).toBe('HomeNetwork123');
    expect(escapeWifiString('Standard-WiFi_5G')).toBe('Standard-WiFi_5G');
  });

  it('handles empty or falsy strings gracefully', () => {
    expect(escapeWifiString('')).toBe('');
    // @ts-expect-error test falsy edge case
    expect(escapeWifiString(null)).toBe('');
    // @ts-expect-error test undefined edge case
    expect(escapeWifiString(undefined)).toBe('');
  });
});
