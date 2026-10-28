import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';

import app from '../mock-server/index.cjs';

let server: http.Server;
let port: number;

const postJson = (body: unknown): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'POST',
        port,
        host: '127.0.0.1',
        path: '/ubus',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data });
        });
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
};

describe('mock-server ubus logging', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = http.createServer(app);
    port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as AddressInfo).port);
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    return new Promise<void>((resolve) => server.close(resolve));
  });

  it('does not interpolate the externally-controlled method into the log format string', async () => {
    const log = vi.mocked(console.log);
    // A method containing format-specifier-like characters must not be able to
    // influence the format string (CodeQL: js/tainted-format-string).
    const taintedMethod = `session.login %s %j`;
    await postJson({ method: taintedMethod, params: {}, id: 1 });

    expect(log).toHaveBeenCalledTimes(1);
    // The format string stays static; the tainted value is a separate argument.
    expect(log.mock.calls[0][0]).toBe('[ubus]');
    expect(log.mock.calls[0][1]).toBe(taintedMethod);
    expect(String(log.mock.calls[0][0])).not.toContain('%');
  });
});
