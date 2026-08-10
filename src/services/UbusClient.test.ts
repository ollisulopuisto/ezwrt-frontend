import { afterAll, describe, it, expect, beforeEach, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (result: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
});

const OK = 0;
const NOT_FOUND = 4;
const PERMISSION_DENIED = 6;

const LOGIN_OK = [OK, { ubus_rpc_session: 'deadbeef1234' }];

/** Fresh client per test: the exported instance keeps session state. */
const loadClient = async () => {
  vi.resetModules();
  const { ubusClient } = await import('./UbusClient');
  ubusClient.setBaseUrl('http://127.0.0.1:3001/ubus');
  return ubusClient;
};

const queue = (...results: unknown[]) => {
  results.forEach((result) => mockFetch.mockResolvedValueOnce(jsonResponse(result)));
};

const requests = () =>
  mockFetch.mock.calls.map((call) => JSON.parse(call[1].body as string));

interface WifiConfig {
  values: { radio0: { ssid: string } };
}

describe('UbusClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('should login and get a session ID', async () => {
    const client = await loadClient();
    queue(LOGIN_OK);

    const sessionId = await client.login('root', 'admin');
    expect(sessionId).toBe('deadbeef1234');
  });

  it('should fetch wifi config', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, { values: { radio0: { ssid: 'EZ-WRT 2.4GHz' } } }]);

    const config = await client.getWifiConfig() as WifiConfig;
    expect(config.values.radio0.ssid).toBe('EZ-WRT 2.4GHz');
  });

  it('should reuse the session instead of logging in per call', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, { uptime: 10 }], [OK, { uptime: 20 }]);

    await client.getSystemStatus();
    await client.getSystemStatus();

    const logins = requests().filter((body) => body.method === 'session.login');
    expect(logins).toHaveLength(1);
    expect(requests()[2].params.ubus_rpc_session).toBe('deadbeef1234');
  });

  it('should re-login and retry once when the session has expired', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [PERMISSION_DENIED, {}], LOGIN_OK, [OK, { uptime: 42 }]);

    const status = await client.getSystemStatus() as { uptime: number };

    expect(status.uptime).toBe(42);
    expect(requests().filter((body) => body.method === 'session.login')).toHaveLength(2);
  });

  it('should throw on non-2xx HTTP response', async () => {
    const client = await loadClient();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

    await expect(client.login('root', 'wrong')).rejects.toThrow('HTTP error 403: Forbidden');
  });

  it('should create the section with uci.add when it does not exist yet', async () => {
    const client = await loadClient();
    // set -> not found, add -> ok, commit -> ok, service.event -> ok
    queue(LOGIN_OK, [NOT_FOUND, {}], [OK, { section: 'block_001122334455' }], [OK, {}], [OK, {}]);

    await client.toggleDeviceInternet('00:11:22:33:44:55', true);

    const [, set, add] = requests();
    expect(set.method).toBe('uci.set');
    expect(add.method).toBe('uci.add');
    expect(add.params.type).toBe('rule');
    expect(add.params.name).toBe('block_001122334455');
    expect(add.params.values.target).toBe('REJECT');
  });

  it('should re-enable the block rule when pausing a device again', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, {}], [OK, {}], [OK, {}]);

    // The section already exists and was left disabled by a previous unpause.
    await client.toggleDeviceInternet('00:11:22:33:44:55', true);

    const [, set] = requests();
    expect(set.params.values.enabled).toBe('1');
  });

  it('should trigger a service reload after committing', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, {}], [OK, {}], [OK, {}]);

    await client.setWifiConfig('default_radio0', { ssid: 'New', key: 'secret123' });

    const [, , commit, event] = requests();
    expect(commit.method).toBe('uci.commit');
    expect(event.method).toBe('service.event');
    expect(event.params).toMatchObject({ type: 'config.change', data: { package: 'wireless' } });
  });

  it('should report a missing reload permission instead of failing silently', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, {}], [OK, {}], [PERMISSION_DENIED, {}], LOGIN_OK, [PERMISSION_DENIED, {}]);

    await expect(client.setWifiConfig('default_radio0', { ssid: 'New' }))
      .rejects.toThrow(/did not reload it.*installer/s);
  });

  it('should write the adblock switch to the global section', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, {}], [OK, {}], [OK, {}]);

    await client.setAdblockEnabled(false);

    const [, set] = requests();
    expect(set.params.config).toBe('adblock');
    expect(set.params.section).toBe('global');
    expect(set.params.values).toEqual({ adb_enabled: '0' });
  });

  it('should add port forwards as DNAT redirect sections', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [NOT_FOUND, {}], [OK, {}], [OK, {}], [OK, {}]);

    await client.addFirewallRule({ name: 'NAS', src_dport: '8080', dest_ip: '192.168.1.100', dest_port: '80' });

    const add = requests()[2];
    expect(add.method).toBe('uci.add');
    expect(add.params.type).toBe('redirect');
    expect(add.params.values.target).toBe('DNAT');
  });

  it('should resolve the WAN device from the wan interface', async () => {
    const client = await loadClient();
    queue(LOGIN_OK, [OK, { device: 'eth1', l3_device: 'eth0.2' }]);

    await expect(client.getWanDevice()).resolves.toBe('eth0.2');
  });
});
