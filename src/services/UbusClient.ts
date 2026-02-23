import axios from 'axios';

export interface UbusResponse<T> {
  jsonrpc: string;
  id: number;
  result: [number, T];
}

class UbusClient {
  private baseUrl: string = import.meta.env.DEV ? '/ubus' : 'http://192.168.1.1/ubus';
  private sessionId: string | null = null;

  setBaseUrl(url: string) {
    // When using the vite proxy, we always hit /ubus locally
    if (import.meta.env.DEV) {
      this.baseUrl = '/ubus';
      return;
    }
    this.baseUrl = url.endsWith('/ubus') ? url : `${url}/ubus`;
    if (!this.baseUrl.startsWith('http')) {
      this.baseUrl = `http://${this.baseUrl}`;
    }
  }

  async login(username: string = 'root', password: string = 'admin'): Promise<string> {
    const response = await axios.post(this.baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'session.login',
      params: { username, password }
    });

    if (response.data.result && response.data.result[0] === 0) {
      this.sessionId = response.data.result[1].ubus_rpc_session;
      return this.sessionId!;
    }
    
    const errorCode = response.data.result ? response.data.result[0] : 'Unknown';
    throw new Error(`Login failed (Code: ${errorCode}). Check credentials and rpcd permissions.`);
  }

  async call<T>(object: string, method: string, params: any = {}): Promise<T> {
    const response = await axios.post<UbusResponse<T>>(this.baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: `${object}.${method}`,
      params: { ...params, ubus_rpc_session: this.sessionId }
    });

    if (response.data.result && response.data.result[0] === 0) {
      return response.data.result[1];
    }
    throw new Error(`RPC error: ${object}.${method}`);
  }

  async getWifiConfig() {
    return this.call('uci', 'get', { config: 'wireless' });
  }

  async setWifiConfig(section: string, values: any) {
    await this.call('uci', 'set', { config: 'wireless', section, values });
    await this.call('uci', 'commit', { config: 'wireless' });
  }

  async getAdblockStatus() {
    return this.call('service', 'list', { name: 'adblock' });
  }

  async setAdblockEnabled(enabled: boolean) {
    await this.call('uci', 'set', {
      config: 'adblock',
      section: 'default',
      values: { enabled: enabled ? '1' : '0' }
    });
    await this.call('uci', 'commit', { config: 'adblock' });
  }

  async getSystemStatus() {
    return this.call('system', 'info');
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
    const section = `rule${Date.now()}`;
    await this.call('uci', 'set', { config: 'firewall', section, values: { ...values, target: 'ACCEPT' } });
    await this.call('uci', 'commit', { config: 'firewall' });
  }

  async toggleDeviceInternet(mac: string, block: boolean) {
    const section = `block_${mac.replace(/:/g, '')}`;
    if (block) {
      await this.call('uci', 'set', { 
        config: 'firewall', 
        section, 
        values: { src: 'lan', dest: 'wan', src_mac: mac, target: 'REJECT', name: `Block ${mac}` } 
      });
    } else {
      await this.call('uci', 'set', { config: 'firewall', section, values: { enabled: '0' } });
    }
    await this.call('uci', 'commit', { config: 'firewall' });
  }

  async setDeviceSchedule(mac: string, startTime: string, stopTime: string, enabled: boolean) {
    const section = `bedtime_${mac.replace(/:/g, '')}`;
    if (enabled) {
      await this.call('uci', 'set', { 
        config: 'firewall', 
        section, 
        values: { 
          src: 'lan', 
          dest: 'wan', 
          src_mac: mac, 
          start_time: startTime, 
          stop_time: stopTime, 
          target: 'REJECT', 
          name: `Bedtime ${mac}`,
          enabled: '1'
        } 
      });
    } else {
      await this.call('uci', 'set', { config: 'firewall', section, values: { enabled: '0' } });
    }
    await this.call('uci', 'commit', { config: 'firewall' });
  }

  async toggleGuestWifi(enabled: boolean) {
    await this.call('uci', 'set', { config: 'wireless', section: 'guest', values: { disabled: enabled ? '0' : '1' } });
    await this.call('uci', 'commit', { config: 'wireless' });
  }

  async reboot() {
    return this.call('system', 'reboot');
  }

  async getVpnStatus(interfaceName: string = 'wg0') {
    return this.call('network.interface', 'status', { interface: interfaceName });
  }

  async toggleVpn(enabled: boolean, interfaceName: string = 'wg0') {
    await this.call('uci', 'set', { 
      config: 'network', 
      section: interfaceName, 
      values: { disabled: enabled ? '0' : '1' } 
    });
    await this.call('uci', 'commit', { config: 'network' });
    // In real OpenWrt, you'd also call 'ifup' or 'ubus call network.interface up'
    await this.call('network.interface', enabled ? 'up' : 'down', { interface: interfaceName });
  }
}

export const ubusClient = new UbusClient();
