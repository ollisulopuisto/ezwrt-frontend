import { afterAll, describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { ubusClient } from './UbusClient';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (result: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
});

interface WifiConfig {
  values: { radio0: { ssid: string } };
}

interface AdblockStatus {
  adblock: { instances: { default: { running: boolean } } };
}

describe('UbusClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeAll(async () => {
    ubusClient.setBaseUrl('http://127.0.0.1:3001/ubus');
  });

  it('should login and get a session ID', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([0, { ubus_rpc_session: 'deadbeef1234' }])
    );

    const sessionId = await ubusClient.login('root', 'admin');
    expect(sessionId).toBe('deadbeef1234');
  });

  it('should fetch wifi config', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([0, { values: { radio0: { ssid: 'EZ-WRT 2.4GHz' } } }])
    );

    const config = await ubusClient.getWifiConfig() as WifiConfig;
    expect(config.values.radio0.ssid).toBe('EZ-WRT 2.4GHz');
  });

  it('should toggle adblock', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([0, {}])) // uci.set
      .mockResolvedValueOnce(jsonResponse([0, {}])) // uci.commit
      .mockResolvedValueOnce(
        jsonResponse([0, { adblock: { instances: { default: { running: false } } } }])
      ); // service.list

    await ubusClient.setAdblockEnabled(false);
    const status = await ubusClient.getAdblockStatus() as AdblockStatus;
    expect(status.adblock.instances.default.running).toBe(false);
  });

  it('should throw on non-2xx HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(ubusClient.login('root', 'wrong')).rejects.toThrow('HTTP error 403: Forbidden');
  });
});
