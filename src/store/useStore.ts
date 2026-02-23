import { create } from 'zustand';
import { ubusClient } from '../services/UbusClient';

interface WifiSection {
  ssid: string;
  key: string;
  disabled: number;
}

interface AppState {
  wifiConfig: Record<string, WifiSection> | null;
  adblockEnabled: boolean;
  routerIp: string;
  loading: boolean;
  error: string | null;
  uptime: number;
  trafficHistory: { time: string, rx: number, tx: number }[];
  firewallRules: any | null;
  guestWifiEnabled: boolean;
  devices: any[];

  fetchData: () => Promise<void>;
  updateWifi: (section: string, ssid: string, key: string) => Promise<void>;
  toggleAdblock: () => Promise<void>;
  setRouterIp: (ip: string) => void;
  rebootRouter: () => Promise<void>;
  addFirewallRule: (rule: any) => Promise<void>;
  toggleGuestWifi: () => Promise<void>;
  toggleDeviceInternet: (mac: string, block: boolean) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  wifiConfig: null,
  adblockEnabled: false,
  routerIp: localStorage.getItem('routerIp') || '127.0.0.1:3001',
  loading: false,
  error: null,
  uptime: 0,
  trafficHistory: [],
  firewallRules: null,
  guestWifiEnabled: false,
  devices: [],

  fetchData: async () => {
    const { routerIp, trafficHistory } = get();
    ubusClient.setBaseUrl(`http://${routerIp}/ubus`);
    
    if (!get().wifiConfig) set({ loading: true, error: null });

    try {
      await ubusClient.login(); 
      const wifiRes: any = await ubusClient.getWifiConfig();
      const adblockRes: any = await ubusClient.getAdblockStatus();
      const systemRes: any = await ubusClient.getSystemStatus();
      const networkRes: any = await ubusClient.getNetworkStats('eth1');
      const firewallRes: any = await ubusClient.getFirewallRules();
      const devicesRes: any = await ubusClient.getDevices();

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const stats = networkRes.statistics || { rx_bytes: 0, tx_bytes: 0 };
      
      const newHistory = [...trafficHistory, { 
        time: now, 
        rx: Math.floor(stats.rx_bytes / 1024 / 1024), 
        tx: Math.floor(stats.tx_bytes / 1024 / 1024) 
      }].slice(-20);

      // Extract devices from nested DHCP response
      const leaseData = devicesRes.device || {};
      let allDevices: any[] = [];
      Object.values(leaseData).forEach((iface: any) => {
        if (iface.leases) allDevices = [...allDevices, ...iface.leases];
      });

      set({
        wifiConfig: wifiRes.values,
        adblockEnabled: !!adblockRes.adblock?.instances?.default?.running,
        uptime: systemRes.uptime || 0,
        trafficHistory: newHistory,
        firewallRules: firewallRes.values,
        guestWifiEnabled: wifiRes.values?.guest?.disabled === 0 || wifiRes.values?.guest?.disabled === '0',
        devices: allDevices,
        loading: false
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  rebootRouter: async () => {
    if (!window.confirm('Are you sure you want to reboot the router?')) return;
    set({ loading: true });
    try {
      await ubusClient.reboot();
      set({ wifiConfig: null, uptime: 0, trafficHistory: [], loading: false });
      alert('Reboot command sent. The interface will reconnect automatically.');
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  toggleDeviceInternet: async (mac: string, block: boolean) => {
    set({ loading: true });
    try {
      await ubusClient.toggleDeviceInternet(mac, block);
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  toggleGuestWifi: async () => {
    const nextState = !get().guestWifiEnabled;
    set({ loading: true });
    try {
      await ubusClient.toggleGuestWifi(nextState);
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  addFirewallRule: async (rule: any) => {
    set({ loading: true });
    try {
      await ubusClient.addFirewallRule(rule);
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  setRouterIp: (ip: string) => {
    localStorage.setItem('routerIp', ip);
    set({ routerIp: ip, wifiConfig: null, trafficHistory: [] });
    get().fetchData();
  },

  updateWifi: async (section: string, ssid: string, key: string) => {
    set({ loading: true });
    try {
      await ubusClient.setWifiConfig(section, { ssid, key });
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  toggleAdblock: async () => {
    const nextState = !get().adblockEnabled;
    set({ loading: true });
    try {
      await ubusClient.setAdblockEnabled(nextState);
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  }
}));
