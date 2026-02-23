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

  fetchData: () => Promise<void>;
  updateWifi: (section: string, ssid: string, key: string) => Promise<void>;
  toggleAdblock: () => Promise<void>;
  setRouterIp: (ip: string) => void;
  rebootRouter: () => Promise<void>;
  addFirewallRule: (rule: any) => Promise<void>;
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

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const stats = networkRes.statistics || { rx_bytes: 0, tx_bytes: 0 };
      
      const newHistory = [...trafficHistory, { 
        time: now, 
        rx: Math.floor(stats.rx_bytes / 1024 / 1024), 
        tx: Math.floor(stats.tx_bytes / 1024 / 1024) 
      }].slice(-20);

      set({
        wifiConfig: wifiRes.values,
        adblockEnabled: !!adblockRes.adblock?.instances?.default?.running,
        uptime: systemRes.uptime || 0,
        trafficHistory: newHistory,
        firewallRules: firewallRes.values,
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
