import { describe, it, expect } from 'vitest';
import {
  isValidIpv4,
  isValidPort,
  isValidPortForwardRule,
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
