export interface UbusResponse<T> {
  jsonrpc: string;
  id: number;
  result: [number, T];
}

// Subset of the ubus status codes we act on.
export const UBUS_STATUS_OK = 0;
export const UBUS_STATUS_METHOD_NOT_FOUND = 3;
export const UBUS_STATUS_NOT_FOUND = 4;
export const UBUS_STATUS_PERMISSION_DENIED = 6;
export const UBUS_STATUS_UNKNOWN = 9;

const STATUS_TEXT: Record<number, string> = {
  1: 'invalid command',
  2: 'invalid argument',
  3: 'method not found',
  4: 'not found',
  5: 'no data',
  6: 'permission denied',
  7: 'timeout',
  8: 'not supported',
  9: 'unknown error',
  10: 'connection failed',
};

export class UbusError extends Error {
  code: number;

  constructor(object: string, method: string, code: number) {
    super(`RPC error: ${object}.${method} (${STATUS_TEXT[code] || `code ${code}`})`);
    this.name = 'UbusError';
    this.code = code;
  }
}

class UbusClient {
  private baseUrl: string = '/ubus';
  private sessionId: string | null = null;
  private username: string = 'root';
  private password: string = 'admin';

  setBaseUrl(url: string) {
    let next = url.endsWith('/ubus') ? url : `${url}/ubus`;
    // Relative URLs go through the dev proxy; anything else needs a scheme.
    if (!next.startsWith('http') && !next.startsWith('/')) {
      next = `http://${next}`;
    }
    if (next !== this.baseUrl) {
      this.sessionId = null;
    }
    this.baseUrl = next;
  }

  // Credentials are kept so an expired session can be renewed transparently.
  setCredentials(username: string, password: string) {
    if (username !== this.username || password !== this.password) {
      this.sessionId = null;
    }
    this.username = username;
    this.password = password;
  }

  private async rpc(body: object): Promise<any> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async login(username: string = this.username, password: string = this.password): Promise<string> {
    this.username = username;
    this.password = password;

    const data = await this.rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'session.login',
      params: { username, password },
    });

    if (data.result && data.result[0] === UBUS_STATUS_OK) {
      this.sessionId = data.result[1].ubus_rpc_session;
      return this.sessionId!;
    }

    const errorCode = data.result ? data.result[0] : 'Unknown';
    throw new Error(`Login failed (Code: ${errorCode}). Check credentials and rpcd permissions.`);
  }

  private async invoke<T>(object: string, method: string, params: any): Promise<[number, T]> {
    const data: UbusResponse<T> = await this.rpc({
      jsonrpc: '2.0',
      id: 1,
      method: `${object}.${method}`,
      params: { ...params, ubus_rpc_session: this.sessionId },
    });
    return data.result || [UBUS_STATUS_UNKNOWN, undefined as T];
  }

  async call<T>(object: string, method: string, params: any = {}): Promise<T> {
    if (!this.sessionId) {
      await this.login();
    }

    let [code, payload] = await this.invoke<T>(object, method, params);

    // rpcd rejects calls with an expired session as "permission denied";
    // renew once before giving up so polling survives session timeouts.
    if (code === UBUS_STATUS_PERMISSION_DENIED) {
      this.sessionId = null;
      await this.login();
      [code, payload] = await this.invoke<T>(object, method, params);
    }

    if (code === UBUS_STATUS_OK) {
      return payload;
    }
    throw new UbusError(object, method, code);
  }

  /**
   * uci.set only updates options on an existing section, so a section that
   * EZ-WRT owns has to be created with uci.add first.
   */
  private async uciUpsert(config: string, section: string, type: string, values: any) {
    try {
      await this.call('uci', 'set', { config, section, values });
    } catch (err) {
      const missing = err instanceof UbusError && err.code === UBUS_STATUS_NOT_FOUND;
      if (!missing) throw err;
      await this.call('uci', 'add', { config, type, name: section, values });
    }
  }

  /**
   * Committing writes /etc/config but changes nothing until the owning service
   * reloads. procd listens for config.change events, which is what
   * `reload_config` (and LuCI's apply) trigger.
   */
  private async commitAndReload(config: string) {
    await this.call('uci', 'commit', { config });
    try {
      await this.call('service', 'event', {
        type: 'config.change',
        data: { package: config },
      });
    } catch (err: any) {
      throw new Error(
        `Saved ${config}, but the router did not reload it (${err.message}). ` +
        'Re-run the EZ-WRT installer to update the rpcd ACL.'
      );
    }
  }

  async getWifiConfig() {
    return this.call('uci', 'get', { config: 'wireless' });
  }

  async setWifiConfig(section: string, values: any) {
    await this.call('uci', 'set', { config: 'wireless', section, values });
    await this.commitAndReload('wireless');
  }

  async getAdblockStatus() {
    return this.call('service', 'list', { name: 'adblock' });
  }

  async setAdblockEnabled(enabled: boolean) {
    // adblock 4.x keeps its master switch in `config adblock 'global'`.
    await this.uciUpsert('adblock', 'global', 'adblock', {
      adb_enabled: enabled ? '1' : '0',
    });
    await this.commitAndReload('adblock');
  }

  async getSystemStatus() {
    return this.call('system', 'info');
  }

  async getInterfaceStatus(interfaceName: string) {
    return this.call<any>('network.interface', 'status', { interface: interfaceName });
  }

  /** Resolve the actual WAN netdev instead of guessing at a device name. */
  async getWanDevice(): Promise<string | null> {
    try {
      const status = await this.getInterfaceStatus('wan');
      return status?.l3_device || status?.device || null;
    } catch {
      return null;
    }
  }

  async getNetworkStats(device: string = 'wan') {
    return this.call('network.device', 'status', { name: device });
  }

  async getDevices() {
    return this.call('dhcp', 'ipv4leases');
  }

  async getFirewallRules() {
    return this.call('uci', 'get', { config: 'firewall' });
  }

  async addFirewallRule(values: any) {
    // Port forwards are `redirect` sections; DNAT on a `rule` section is invalid.
    const suffix = String(values.name || 'forward').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 24);
    const section = `ezwrt_fwd_${suffix}`;
    await this.uciUpsert('firewall', section, 'redirect', {
      ...values,
      target: 'DNAT',
      enabled: '1',
    });
    await this.commitAndReload('firewall');
  }

  async toggleDeviceInternet(mac: string, block: boolean) {
    const section = `block_${mac.replace(/:/g, '')}`;
    if (block) {
      await this.uciUpsert('firewall', section, 'rule', {
        src: 'lan',
        dest: 'wan',
        src_mac: mac,
        proto: 'all',
        target: 'REJECT',
        name: `Block ${mac}`,
        // Must be re-asserted: unblocking leaves enabled='0' behind.
        enabled: '1',
      });
    } else {
      await this.uciUpsert('firewall', section, 'rule', { enabled: '0' });
    }
    await this.commitAndReload('firewall');
  }

  async setDeviceSchedule(mac: string, startTime: string, stopTime: string, enabled: boolean) {
    const section = `bedtime_${mac.replace(/:/g, '')}`;
    if (enabled) {
      await this.uciUpsert('firewall', section, 'rule', {
        src: 'lan',
        dest: 'wan',
        src_mac: mac,
        proto: 'all',
        start_time: startTime,
        stop_time: stopTime,
        target: 'REJECT',
        name: `Bedtime ${mac}`,
        enabled: '1',
      });
    } else {
      await this.uciUpsert('firewall', section, 'rule', { enabled: '0' });
    }
    await this.commitAndReload('firewall');
  }

  async toggleGuestWifi(enabled: boolean, section: string = 'guest') {
    await this.call('uci', 'set', {
      config: 'wireless',
      section,
      values: { disabled: enabled ? '0' : '1' },
    });
    await this.commitAndReload('wireless');
  }

  async reboot() {
    return this.call('system', 'reboot');
  }

  async getVpnStatus(interfaceName: string = 'wg0') {
    return this.getInterfaceStatus(interfaceName);
  }

  async toggleVpn(enabled: boolean, interfaceName: string = 'wg0') {
    await this.call('uci', 'set', {
      config: 'network',
      section: interfaceName,
      values: { disabled: enabled ? '0' : '1' },
    });
    await this.commitAndReload('network');
    await this.call('network.interface', enabled ? 'up' : 'down', { interface: interfaceName });
  }
}

export const ubusClient = new UbusClient();
