import { describe, it, expect } from 'vitest';
import {
  isValidIpv4,
  isValidPort,
  isValidPortForwardRule,
  isValidMacAddress,
  isValidTimeString,
  isValidRouterEndpoint,
  isValidWifiSsid,
  isValidWifiKey,
  isValidUciSection,
} from './validation';

describe('isValidIpv4', () => {
  it('accepts valid IPv4 addresses', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('10.0.0.1')).toBe(true);
    expect(isValidIpv4('172.16.254.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4(' 192.168.1.100 ')).toBe(true);
  });

  it('rejects invalid or malformed IPv4 addresses', () => {
    expect(isValidIpv4('256.0.0.1')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('192.168.1.1.1')).toBe(false);
    expect(isValidIpv4('192.168.1.-1')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false); // leading zeros
    expect(isValidIpv4('192.168.1.a')).toBe(false);
    expect(isValidIpv4('192.168.1.1; rm -rf /')).toBe(false);
    expect(isValidIpv4('192.168.1.1\n')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidIpv4(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidIpv4(undefined)).toBe(false);
  });
});

describe('isValidPort', () => {
  it('accepts valid port numbers and strings', () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(443)).toBe(true);
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort('8080')).toBe(true);
    expect(isValidPort(' 22 ')).toBe(true);
  });

  it('rejects ports out of range or malformed ports', () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(80.5)).toBe(false);
    expect(isValidPort('0')).toBe(false);
    expect(isValidPort('65536')).toBe(false);
    expect(isValidPort('http')).toBe(false);
    expect(isValidPort('80; reboot')).toBe(false);
    // @ts-expect-error test invalid types
    expect(isValidPort(null)).toBe(false);
  });
});

describe('isValidPortForwardRule', () => {
  it('accepts valid port forward rule objects', () => {
    expect(
      isValidPortForwardRule({
        name: 'Web Server',
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(true);

    expect(
      isValidPortForwardRule({
        src_dport: 443,
        dest_ip: '10.0.0.2',
        dest_port: 8443,
      })
    ).toBe(true);

    expect(
      isValidPortForwardRule({
        name: 'Valid_Rule-1',
        src_dport: '22',
        dest_ip: '192.168.1.20',
        dest_port: '22',
      })
    ).toBe(true);
  });

  it('rejects port forward rules with invalid dest_ip or ports', () => {
    expect(
      isValidPortForwardRule({
        src_dport: '8080',
        dest_ip: '999.999.999.999',
        dest_port: '80',
      })
    ).toBe(false);

    expect(
      isValidPortForwardRule({
        src_dport: 'invalid_port',
        dest_ip: '192.168.1.50',
        dest_port: '80',
      })
    ).toBe(false);

    expect(
      isValidPortForwardRule({
        src_dport: '80',
        dest_ip: '192.168.1.50',
        dest_port: '70000',
      })
    ).toBe(false);

    // @ts-expect-error test null rule
    expect(isValidPortForwardRule(null)).toBe(false);
  });

  it('rejects port forward rules with invalid names', () => {
    // Name with newline or carriage return injection
    expect(
      isValidPortForwardRule({
        name: 'Bad\nName',
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(false);

    expect(
      isValidPortForwardRule({
        name: 'Bad\rName',
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(false);

    // Name with null byte
    expect(
      isValidPortForwardRule({
        name: 'Bad\0Name',
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(false);

    // Name exceeding 32 characters
    expect(
      isValidPortForwardRule({
        name: 'a'.repeat(33),
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(false);

    // Non-string name
    expect(
      isValidPortForwardRule({
        // @ts-expect-error test non-string name
        name: 12345,
        src_dport: '8080',
        dest_ip: '192.168.1.100',
        dest_port: '80',
      })
    ).toBe(false);
  });
});

describe('isValidMacAddress', () => {
  it('accepts valid colon or hyphen separated MAC addresses', () => {
    expect(isValidMacAddress('00:11:22:33:44:55')).toBe(true);
    expect(isValidMacAddress('a1:b2:c3:d4:e5:f6')).toBe(true);
    expect(isValidMacAddress('A1:B2:C3:D4:E5:F6')).toBe(true);
    expect(isValidMacAddress('00-11-22-33-44-55')).toBe(true);
    expect(isValidMacAddress(' 00:11:22:33:44:55 ')).toBe(true);
  });

  it('rejects invalid or malformed MAC addresses', () => {
    expect(isValidMacAddress('00:11:22:33:44')).toBe(false);
    expect(isValidMacAddress('00:11:22:33:44:55:66')).toBe(false);
    expect(isValidMacAddress('00:11:22:33:44:gg')).toBe(false);
    expect(isValidMacAddress('001122334455')).toBe(false);
    expect(isValidMacAddress('00:11:22:33:44:55\n')).toBe(false);
    expect(isValidMacAddress('00:11:22:33:44:55; reboot')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidMacAddress(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidMacAddress(undefined)).toBe(false);
  });
});

describe('isValidTimeString', () => {
  it('accepts valid 24-hour HH:MM time strings', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('07:30')).toBe(true);
    expect(isValidTimeString('21:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString(' 12:34 ')).toBe(true);
  });

  it('rejects invalid time strings', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('12:60')).toBe(false);
    expect(isValidTimeString('7:00')).toBe(false);
    expect(isValidTimeString('21:0')).toBe(false);
    expect(isValidTimeString('12:00:00')).toBe(false);
    expect(isValidTimeString('abc')).toBe(false);
    expect(isValidTimeString('21:00; reboot')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidTimeString(null)).toBe(false);
  });
});

describe('isValidRouterEndpoint', () => {
  it('accepts valid IP addresses with and without ports', () => {
    expect(isValidRouterEndpoint('192.168.1.1')).toBe(true);
    expect(isValidRouterEndpoint('127.0.0.1')).toBe(true);
    expect(isValidRouterEndpoint('10.0.0.1:80')).toBe(true);
    expect(isValidRouterEndpoint('127.0.0.1:3001')).toBe(true);
    expect(isValidRouterEndpoint('192.168.1.1:65535')).toBe(true);
  });

  it('accepts valid hostnames and domain names with and without ports', () => {
    expect(isValidRouterEndpoint('openwrt.lan')).toBe(true);
    expect(isValidRouterEndpoint('router.local')).toBe(true);
    expect(isValidRouterEndpoint('my-router.lan:8080')).toBe(true);
    expect(isValidRouterEndpoint('localhost:3001')).toBe(true);
    expect(isValidRouterEndpoint('gateway')).toBe(true);
  });

  it('rejects schemes, URLs, paths, traversal, credentials, or fragments', () => {
    expect(isValidRouterEndpoint('http://192.168.1.1')).toBe(false);
    expect(isValidRouterEndpoint('https://router.local')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1/ubus')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1/../admin')).toBe(false);
    expect(isValidRouterEndpoint('admin:pass@192.168.1.1')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1?query=1')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1#fragment')).toBe(false);
    expect(isValidRouterEndpoint('javascript:alert(1)')).toBe(false);
  });

  it('rejects invalid ports, spaces, newlines, and non-string inputs', () => {
    expect(isValidRouterEndpoint('192.168.1.1:0')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1:65536')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1:abc')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1:')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1:80:80')).toBe(false);
    expect(isValidRouterEndpoint('192.168. 1.1')).toBe(false);
    expect(isValidRouterEndpoint('192.168.1.1\n')).toBe(false);
    expect(isValidRouterEndpoint('')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidRouterEndpoint(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidRouterEndpoint(undefined)).toBe(false);
  });
});

describe('isValidWifiSsid', () => {
  it('accepts valid SSIDs between 1 and 32 bytes', () => {
    expect(isValidWifiSsid('MyHomeWiFi')).toBe(true);
    expect(isValidWifiSsid('A')).toBe(true);
    expect(isValidWifiSsid('12345678901234567890123456789012')).toBe(true); // 32 chars ASCII
    expect(isValidWifiSsid('WiFi 2.4G-Guest')).toBe(true);
  });

  it('rejects empty SSIDs or SSIDs longer than 32 bytes', () => {
    expect(isValidWifiSsid('')).toBe(false);
    expect(isValidWifiSsid('123456789012345678901234567890123')).toBe(false); // 33 chars ASCII
    // Multi-byte UTF-8 character overflow: 17 2-byte chars = 34 bytes
    expect(isValidWifiSsid('ööööööööööööööööö')).toBe(false);
  });

  it('rejects SSIDs with newlines, carriage returns, or null characters', () => {
    expect(isValidWifiSsid('MyNetwork\n')).toBe(false);
    expect(isValidWifiSsid('MyNetwork\r\n')).toBe(false);
    expect(isValidWifiSsid('My\0Network')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidWifiSsid(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidWifiSsid(undefined)).toBe(false);
  });
});

describe('isValidWifiKey', () => {
  it('accepts valid WPA passphrases (8-63 ASCII printable chars)', () => {
    expect(isValidWifiKey('password123')).toBe(true);
    expect(isValidWifiKey('12345678')).toBe(true); // 8 chars min
    expect(isValidWifiKey('a'.repeat(63))).toBe(true); // 63 chars max
    expect(isValidWifiKey('Pass with spaces !@#$%^&*()_+')).toBe(true);
  });

  it('accepts valid 64-character hex pre-shared keys', () => {
    const validHex64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    expect(isValidWifiKey(validHex64)).toBe(true);
    expect(isValidWifiKey(validHex64.toUpperCase())).toBe(true);
  });

  it('rejects keys too short, too long, or non-hex 64-char strings', () => {
    expect(isValidWifiKey('short')).toBe(false); // < 8 chars
    expect(isValidWifiKey('a'.repeat(65))).toBe(false); // > 64 chars
    expect(isValidWifiKey('z'.repeat(64))).toBe(false); // 64 chars but non-hex
  });

  it('rejects keys with newlines, carriage returns, or control characters', () => {
    expect(isValidWifiKey('password123\n')).toBe(false);
    expect(isValidWifiKey('password\r12345')).toBe(false);
    expect(isValidWifiKey('password\x00123')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidWifiKey(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidWifiKey(undefined)).toBe(false);
  });
});

describe('isValidUciSection', () => {
  it('accepts valid UCI section identifiers', () => {
    expect(isValidUciSection('default_radio0')).toBe(true);
    expect(isValidUciSection('radio0')).toBe(true);
    expect(isValidUciSection('guest')).toBe(true);
    expect(isValidUciSection('cfg01e63b')).toBe(true);
    expect(isValidUciSection('ezwrt_fwd_NAS')).toBe(true);
    expect(isValidUciSection('section123')).toBe(true);
    expect(isValidUciSection('_config')).toBe(true);
  });

  it('rejects empty, spaced, control characters, or punctuation in section identifiers', () => {
    expect(isValidUciSection('')).toBe(false);
    expect(isValidUciSection('default radio0')).toBe(false);
    expect(isValidUciSection('default_radio0\n')).toBe(false);
    expect(isValidUciSection('section;rm')).toBe(false);
    expect(isValidUciSection('sec.tion')).toBe(false);
    expect(isValidUciSection('sec-tion')).toBe(false);
    expect(isValidUciSection('../secret')).toBe(false);
    expect(isValidUciSection('sec\0tion')).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidUciSection(null)).toBe(false);
    // @ts-expect-error test non-string types
    expect(isValidUciSection(undefined)).toBe(false);
  });
});
