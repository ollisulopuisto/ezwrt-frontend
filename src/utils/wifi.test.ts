import { describe, it, expect, vi, beforeEach } from 'vitest';
import qrcode from 'qrcode-generator';
import {
  escapeWifiString,
  wifiQrPayload,
  wifiQrDataUrl,
  WIFI_QR_CACHE_LIMIT,
} from './wifi';

// The fake encodes whatever was passed to addData into its data URL, so tests
// can assert on the payload the QR code actually carries.
vi.mock('qrcode-generator', () => ({
  default: vi.fn(() => {
    let data = '';
    return {
      addData: vi.fn((d: string) => {
        data = d;
      }),
      make: vi.fn(),
      createDataURL: vi.fn(() => `qr:${data}`),
    };
  }),
}));

const qrFactory = vi.mocked(qrcode);

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

describe('wifiQrPayload', () => {
  it('builds the WIFI: string with escaped SSID and key', () => {
    expect(wifiQrPayload('My;Net', 'pa:ss,1')).toBe('WIFI:S:My\\;Net;T:WPA;P:pa\\:ss\\,1;;');
  });

  it('tolerates a missing key', () => {
    // @ts-expect-error test missing key on an open or partial section
    expect(wifiQrPayload('Open', undefined)).toBe('WIFI:S:Open;T:WPA;P:;;');
  });
});

describe('wifiQrDataUrl', () => {
  beforeEach(() => {
    qrFactory.mockClear();
  });

  it('encodes the escaped payload', () => {
    expect(wifiQrDataUrl('Home;5G', 'pass')).toBe('qr:WIFI:S:Home\\;5G;T:WPA;P:pass;;');
  });

  it('does not regenerate the QR code for identical credentials', () => {
    const first = wifiQrDataUrl('cache-hit-ssid', 'pw');
    const second = wifiQrDataUrl('cache-hit-ssid', 'pw');
    expect(second).toBe(first);
    expect(qrFactory).toHaveBeenCalledTimes(1);
  });

  it('regenerates when the key changes', () => {
    const a = wifiQrDataUrl('cache-change-ssid', 'a');
    const b = wifiQrDataUrl('cache-change-ssid', 'b');
    expect(a).not.toBe(b);
    expect(qrFactory).toHaveBeenCalledTimes(2);
  });

  it('bounds the cache so credentials do not accumulate forever', () => {
    for (let i = 0; i <= WIFI_QR_CACHE_LIMIT; i++) {
      wifiQrDataUrl(`bound-${i}`, 'pw');
    }
    qrFactory.mockClear();
    // The oldest entry was evicted, so it has to be generated again.
    wifiQrDataUrl('bound-0', 'pw');
    expect(qrFactory).toHaveBeenCalledTimes(1);
  });
});
