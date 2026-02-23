import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ubusClient } from './UbusClient';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('UbusClient', () => {
  beforeAll(async () => {
    ubusClient.setBaseUrl('http://127.0.0.1:3001/ubus');
  });

  it('should login and get a session ID', async () => {
    const sessionId = await ubusClient.login('root', 'admin');
    expect(sessionId).toBe('deadbeef1234');
  });

  it('should fetch wifi config', async () => {
    const config: any = await ubusClient.getWifiConfig();
    expect(config.values.radio0.ssid).toBe('EZ-WRT 2.4GHz');
  });

  it('should toggle adblock', async () => {
    await ubusClient.setAdblockEnabled(false);
    const status: any = await ubusClient.getAdblockStatus();
    expect(status.adblock.instances.default.running).toBe(false);
  });
});
