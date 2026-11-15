import { describe, it, expect } from 'vitest';
import { isValidRouterEndpoint } from './validation';

/**
 * Fuzz test for isValidRouterEndpoint - SSRF prevention.
 *
 * Target: isValidRouterEndpoint
 * Budget: ~2100 generated cases across multiple seeds
 * Seeds: 1, 42, 999
 *
 * Invariant: Any endpoint containing whitespace/control characters, path separators (/),
 * query (?), fragment (#), credentials (@), backslash (\), or a URL scheme (://) must be
 * rejected. Only bare host[:port] is accepted.
 */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randomString(rng: () => number, maxLen: number): string {
  const len = Math.floor(rng() * maxLen) + 1;
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    const r = rng();
    if (r < 0.08) chars.push(String.fromCharCode(Math.floor(rng() * 32))); // control chars
    else if (r < 0.16) chars.push('://@?#\\'.charAt(Math.floor(rng() * 7))); // SSRF vectors
    else if (r < 0.24) chars.push('\r\n\t'.charAt(Math.floor(rng() * 3))); // newlines/tabs
    else if (r < 0.34) chars.push(' ./-_:'.charAt(Math.floor(rng() * 6))); // separators incl. colon/period
    else chars.push(String.fromCharCode(97 + Math.floor(rng() * 26))); // lowercase letters
  }
  return chars.join('');
}

function isDangerous(input: string): boolean {
  // Characters the validator explicitly rejects
  if (/[\r\n\s]/.test(input)) return true;
  if (/[/?#@\\]/.test(input)) return true;
  // URL scheme patterns (something://...)
  if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) return true;
  return false;
}

describe('isValidRouterEndpoint fuzz', () => {
  const seeds = [1, 42, 999];
  const iterationsPerSeed = 700;

  for (const seed of seeds) {
    it(`rejects SSRF vectors - seed ${seed}`, () => {
      const rng = seededRandom(seed);
      let rejections = 0;
      let accepted = 0;

      for (let i = 0; i < iterationsPerSeed; i++) {
        const input = randomString(rng, 40);
        const valid = isValidRouterEndpoint(input);

        if (isDangerous(input)) {
          expect(valid).toBe(false);
          rejections++;
        } else {
          accepted++;
        }
      }

      // Ensure we actually exercised dangerous inputs and benign ones
      expect(rejections).toBeGreaterThan(0);
      expect(accepted).toBeGreaterThan(0);
    });
  }

  // Explicit SSRF and injection payloads that must never be accepted
  it('rejects explicit SSRF and injection payloads', () => {
    const payloads = [
      'http://192.168.1.1',
      'https://router.local',
      '192.168.1.1/ubus',
      '192.168.1.1/../admin',
      'admin:pass@192.168.1.1',
      '192.168.1.1?query=1',
      '192.168.1.1#fragment',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'ftp://192.168.1.1',
      '192.168.1.1\\escape',
      '192.168.1.1\n',
      '192.168.1.1\r\n',
      '192.168.1.1\t',
      '',
      ' ',
      '192.168.1.1:80:80',
      'localhost:3001/evil',
      '192.168.1.1:0',
      '192.168.1.1:65536',
    ];
    for (const p of payloads) {
      expect(isValidRouterEndpoint(p)).toBe(false);
    }
  });

  // Benign endpoints that must be accepted
  it('accepts legitimate router endpoints', () => {
    const valid = [
      '192.168.1.1',
      '127.0.0.1',
      '10.0.0.1:80',
      '127.0.0.1:3001',
      'openwrt.lan',
      'router.local',
      'my-router.lan:8080',
      'localhost:3001',
      'gateway',
      '192.168.1.1:65535',
    ];
    for (const v of valid) {
      expect(isValidRouterEndpoint(v)).toBe(true);
    }
  });
});
