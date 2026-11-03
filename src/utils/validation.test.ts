import { describe, it, expect } from 'vitest';
import {
  isValidIpv4,
  isValidPort,
  isValidPortForwardRule,
  isValidMacAddress,
  isValidTimeString,
  isValidRouterEndpoint,
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
