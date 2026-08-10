import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ubusClient } from './UbusClient';

/**
 * Drives the real client against the real mock server. Unit tests assert what
 * the client sends; this asserts the router-shaped end of it — that sections
 * get created, that toggles survive a round trip, and that a reload is fired.
 */

const PORT = 3199;
const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, '../../mock-server/index.cjs');

let server: ChildProcess;

const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/ubus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.login', params: {} }),
      });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('mock server did not start');
};

const uciGet = (config: string) => ubusClient.call<any>('uci', 'get', { config });

describe('UbusClient against the mock server', () => {
  beforeAll(async () => {
    server = fork(serverPath, [], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
    });
    await waitForServer();
    ubusClient.setBaseUrl(`http://127.0.0.1:${PORT}/ubus`);
    await ubusClient.login('root', 'admin');
  }, 20000);

  afterAll(() => {
    server?.kill();
  });

  it('creates a firewall section that does not exist yet', async () => {
    const mac = '00:11:22:33:44:55';
    await ubusClient.toggleDeviceInternet(mac, true);
    await ubusClient.applyChanges(['firewall']);
    await ubusClient.confirmChanges();

    const firewall = await uciGet('firewall');
    expect(firewall.values.block_001122334455).toMatchObject({
      '.type': 'rule',
      target: 'REJECT',
      src_mac: mac,
      enabled: '1',
    });
  });

  it('re-blocks a device after it has been unblocked', async () => {
    const mac = '00:11:22:33:44:55';

    await ubusClient.toggleDeviceInternet(mac, false);
    await ubusClient.applyChanges(['firewall']);
    await ubusClient.confirmChanges();
    let firewall = await uciGet('firewall');
    expect(firewall.values.block_001122334455.enabled).toBe('0');

    await ubusClient.toggleDeviceInternet(mac, true);
    await ubusClient.applyChanges(['firewall']);
    await ubusClient.confirmChanges();
    firewall = await uciGet('firewall');
    expect(firewall.values.block_001122334455.enabled).toBe('1');
  });

  it('adds a port forward as a redirect section', async () => {
    await ubusClient.addFirewallRule({
      name: 'NAS',
      src: 'wan',
      dest: 'lan',
      proto: 'tcp',
      src_dport: '8080',
      dest_ip: '192.168.1.100',
      dest_port: '80',
    });
    await ubusClient.applyChanges(['firewall']);
    await ubusClient.confirmChanges();

    const firewall = await uciGet('firewall');
    expect(firewall.values.ezwrt_fwd_NAS).toMatchObject({
      '.type': 'redirect',
      target: 'DNAT',
      dest_ip: '192.168.1.100',
    });
  });

  it('toggles adblock through the global section', async () => {
    await ubusClient.setAdblockEnabled(false);
    await ubusClient.applyChanges(['adblock']);
    await ubusClient.confirmChanges();
    expect((await uciGet('adblock')).values.global.adb_enabled).toBe('0');

    const status = await ubusClient.getAdblockStatus() as any;
    expect(status.adblock.instances.instance1.running).toBe(false);

    await ubusClient.setAdblockEnabled(true);
    await ubusClient.applyChanges(['adblock']);
    await ubusClient.confirmChanges();
    expect((await uciGet('adblock')).values.global.adb_enabled).toBe('1');
  });

  it('toggles the guest network and the VPN interface', async () => {
    await ubusClient.toggleGuestWifi(true, 'guest');
    await ubusClient.applyChanges(['wireless']);
    await ubusClient.confirmChanges();
    expect((await uciGet('wireless')).values.guest.disabled).toBe('0');

    await ubusClient.toggleVpn(true, 'wg0');
    await ubusClient.applyChanges(['network']);
    await ubusClient.confirmChanges();
    await ubusClient.setInterfaceUp(true, 'wg0');
    const vpn = await ubusClient.getVpnStatus('wg0') as any;
    expect(vpn.up).toBe(true);
  });

  it('reverts an unconfirmed change when the timer runs out', async () => {
    const before = (await uciGet('wireless')).values.default_radio0.ssid;

    await ubusClient.setWifiConfig('default_radio0', { ssid: 'Locked-Me-Out' });
    await ubusClient.applyChanges(['wireless'], 1);

    // Applied and live, but not yet confirmed.
    expect((await uciGet('wireless')).values.default_radio0.ssid).toBe('Locked-Me-Out');

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Nobody confirmed, so the router put the previous config back.
    expect((await uciGet('wireless')).values.default_radio0.ssid).toBe(before);
  });

  it('keeps a change that is confirmed in time', async () => {
    await ubusClient.setWifiConfig('default_radio0', { ssid: 'Deliberate' });
    await ubusClient.applyChanges(['wireless'], 1);
    await ubusClient.confirmChanges();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect((await uciGet('wireless')).values.default_radio0.ssid).toBe('Deliberate');
  });

  it('resolves the WAN device rather than guessing', async () => {
    const device = await ubusClient.getWanDevice();
    expect(device).toBe('eth1');

    const stats = await ubusClient.getNetworkStats(device!) as any;
    expect(stats.statistics.rx_bytes).toBeGreaterThan(0);

    // The old hardcoded guess is rejected by the mock, as it would be by a router.
    await expect(ubusClient.getNetworkStats('wan0')).rejects.toThrow(/not found/);
  });
});
