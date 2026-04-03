import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { ubusClient } from './UbusClient';

vi.mock('axios');

describe('UbusClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    ubusClient.setBaseUrl('http://127.0.0.1:3001/ubus');
  });

  it('should login and get a session ID', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        result: [0, { ubus_rpc_session: 'deadbeef1234' }]
      }
    });

    const sessionId = await ubusClient.login('root', 'admin');
    expect(sessionId).toBe('deadbeef1234');
  });

  it('should fetch wifi config', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        result: [0, { values: { radio0: { ssid: 'EZ-WRT 2.4GHz' } } }]
      }
    });

    const config = await ubusClient.getWifiConfig() as { values: { radio0: { ssid: string } } };
    expect(config.values.radio0.ssid).toBe('EZ-WRT 2.4GHz');
  });

  it('should toggle adblock', async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { result: [0, {}] } }) // uci.set
      .mockResolvedValueOnce({ data: { result: [0, {}] } }) // uci.commit
      .mockResolvedValueOnce({
        data: {
          result: [0, { adblock: { instances: { default: { running: false } } } }]
        }
      }); // service.list

    await ubusClient.setAdblockEnabled(false);
    const status = await ubusClient.getAdblockStatus() as {
      adblock: { instances: { default: { running: boolean } } };
    };
    expect(status.adblock.instances.default.running).toBe(false);
  });
});
