import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Regression test for credential forwarding via HTTP redirects.
 *
 * The ubus client posts the router password (session.login) and the ubus
 * session token (every other call) in the request body. Fetch follows
 * redirects by default, and a 307/308 redirect replays method and body at the
 * Location origin — so an endpoint that answers with a redirect could harvest
 * those credentials. UbusClient.rpc must therefore refuse to follow redirects.
 */

const listen = (server: http.Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

describe('UbusClient redirect handling', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
    servers.length = 0;
  });

  it('does not replay credentials to a redirect target', async () => {
    const collected: string[] = [];

    // Stands in for an attacker-controlled host named by the redirect.
    const collector = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        collected.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    const collectorPort = await listen(collector);
    servers.push(collector);

    // Stands in for a router endpoint that answers with a redirect.
    const redirector = http.createServer((_req, res) => {
      res.writeHead(307, { Location: `http://127.0.0.1:${collectorPort}/collect` });
      res.end();
    });
    const redirectorPort = await listen(redirector);
    servers.push(redirector);

    vi.resetModules();
    const { ubusClient } = await import('./UbusClient');
    ubusClient.setBaseUrl(`http://127.0.0.1:${redirectorPort}/ubus`);
    ubusClient.setCredentials('root', 'not-a-real-password');

    // The call fails closed instead of reaching the redirect target.
    await expect(ubusClient.call('system', 'info')).rejects.toBeTruthy();

    // No credential-bearing request body may arrive anywhere but the endpoint.
    expect(collected).toEqual([]);
  });
});
