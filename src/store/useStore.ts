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

  fetchData: () => Promise<void>;
  updateWifi: (section: string, ssid: string, key: string) => Promise<void>;
  toggleAdblock: () => Promise<void>;
  setRouterIp: (ip: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  wifiConfig: null,
  adblockEnabled: false,
  routerIp: localStorage.getItem('routerIp') || '127.0.0.1:3001',
  loading: false,
  error: null,
  uptime: 0,
  trafficHistory: [],

  fetchData: async () => {
    const { routerIp, trafficHistory } = get();
    ubusClient.setBaseUrl(`http://${routerIp}/ubus`);
    
    // Initial fetch might set loading: true, but updates shouldn't flicker
    if (!get().wifiConfig) set({ loading: true, error: null });

    try {
      await ubusClient.login(); 
      const wifiRes: any = await ubusClient.getWifiConfig();
      const adblockRes: any = await ubusClient.getAdblockStatus();
      const systemRes: any = await ubusClient.getSystemStatus();
      const networkRes: any = await ubusClient.getNetworkStats('eth1'); // Often wan is eth1

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const stats = networkRes.statistics || { rx_bytes: 0, tx_bytes: 0 };
      
      const newHistory = [...trafficHistory, { 
        time: now, 
        rx: Math.floor(stats.rx_bytes / 1024 / 1024), 
        tx: Math.floor(stats.tx_bytes / 1024 / 1024) 
      }].slice(-20); // Keep last 20 points

      set({
        wifiConfig: wifiRes.values,
        adblockEnabled: !!adblockRes.adblock?.instances?.default?.running,
        uptime: systemRes.uptime || 0,
        trafficHistory: newHistory,
        loading: false
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  setRouterIp: (ip: string) => {
    localStorage.setItem('routerIp', ip);
    set({ routerIp: ip });
    get().fetchData(); // Trigger refresh with new IP
  },

  updateWifi: async (section: string, ssid: string, key: string) => {
    set({ loading: true });
    try {
      await ubusClient.setWifiConfig(section, { ssid, key });
      await get().fetchData(); // Refresh state
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  toggleAdblock: async () => {
    const nextState = !get().adblockEnabled;
    set({ loading: true });
    try {
      await ubusClient.setAdblockEnabled(nextState);
      await get().fetchData(); // Refresh state
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  }
}));
