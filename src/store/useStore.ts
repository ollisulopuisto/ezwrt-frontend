import { create } from 'zustand';
import { ubusClient } from '../services/UbusClient';

interface WifiSection {
  ssid: string;
  key: string;
  disabled: number;
  device?: string;
}

interface SettingsBackup {
  savedAt: string;
  wifi: Record<string, { ssid: string; key: string }>;
  adblockEnabled: boolean;
  guestWifiEnabled: boolean;
  vpnEnabled: boolean;
}

const SETTINGS_BACKUP_KEY = 'ezwrtSettingsBackupV1';

const readBackupTimestamp = (): string | null => {
  try {
    const raw = localStorage.getItem(SETTINGS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SettingsBackup>;
    return typeof parsed.savedAt === 'string' ? parsed.savedAt : null;
  } catch {
    return null;
  }
};

/**
 * Wireless sections are named by the installer/user, not by OpenWrt, so the
 * guest network is located by name instead of assuming a `guest` section.
 */
export const findGuestSection = (
  values: Record<string, WifiSection> | null | undefined
): string | null => {
  const entries = Object.entries(values || {});
  const match =
    entries.find(([section]) => section === 'guest') ||
    entries.find(([section, conf]) => /guest/i.test(section) || /guest/i.test(conf?.ssid || ''));
  return match ? match[0] : null;
};

const isDisabled = (value: unknown) => value === 1 || value === '1' || value === true;

const isAdblockRunning = (status: any): boolean => {
  const instances = status?.adblock?.instances;
  if (!instances) return false;
  return Object.values(instances).some((instance: any) => !!instance?.running);
};

/** Optional data: a missing service must not take the whole dashboard down. */
const optional = async <T,>(call: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await call();
  } catch {
    return fallback;
  }
};

interface AppState {
  theme: 'light' | 'dark';
  wifiConfig: Record<string, WifiSection> | null;
  guestWifiSection: string | null;
  adblockEnabled: boolean;
  routerIp: string;
  routerUser: string;
  routerPass: string;
  loading: boolean;
  error: string | null;
  uptime: number;
  trafficHistory: { time: string, rx: number, tx: number }[];
  firewallRules: any | null;
  guestWifiEnabled: boolean;
  devices: any[];
  vpnStatus: { up: boolean, ip: string, uptime: number } | null;
  settingsBackupAt: string | null;
  settingsMessage: string | null;

  fetchData: () => Promise<void>;
  updateWifi: (section: string, ssid: string, key: string) => Promise<void>;
  toggleAdblock: () => Promise<void>;
  setRouterIp: (ip: string, user: string, pass: string) => void;
  rebootRouter: () => Promise<void>;
  addFirewallRule: (rule: any) => Promise<void>;
  toggleGuestWifi: () => Promise<void>;
  toggleDeviceInternet: (mac: string, block: boolean) => Promise<void>;
  setDeviceSchedule: (mac: string, startTime: string, stopTime: string, enabled: boolean) => Promise<void>;
  toggleVpn: () => Promise<void>;
  saveSettingsBackup: () => void;
  restoreSettingsBackup: () => Promise<void>;
  clearSettingsMessage: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

// Resolved once per session; the WAN netdev name varies per device.
let wanDevice: string | null = null;

export const useStore = create<AppState>((set, get) => ({
  theme: localStorage.getItem('theme') === 'dark' ? 'dark' : 'light',
  wifiConfig: null,
  guestWifiSection: null,
  adblockEnabled: false,
  routerIp: localStorage.getItem('routerIp') || '192.168.1.1',
  routerUser: localStorage.getItem('routerUser') || 'root',
  routerPass: localStorage.getItem('routerPass') || 'admin',
  loading: false,
  error: null,
  uptime: 0,
  trafficHistory: [],
  firewallRules: null,
  guestWifiEnabled: false,
  devices: [],
  vpnStatus: null,
  settingsBackupAt: readBackupTimestamp(),
  settingsMessage: null,

  fetchData: async () => {
    const { routerIp, routerUser, routerPass, trafficHistory } = get();

    if (import.meta.env.PROD) {
      // When the app is served by the router itself, stay on the same origin so
      // the request needs no CORS exemption (and survives an https front-end).
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      const sameOrigin = !!host && host === routerIp.split(':')[0];
      ubusClient.setBaseUrl(sameOrigin ? '/ubus' : `http://${routerIp}/ubus`);
    }
    ubusClient.setCredentials(routerUser, routerPass);

    if (!get().wifiConfig) set({ loading: true, error: null });

    try {
      // Wireless config is the one hard requirement; everything else degrades.
      const wifiRes: any = await ubusClient.getWifiConfig();

      if (wanDevice === null) {
        wanDevice = (await ubusClient.getWanDevice()) || 'wan';
      }

      const [adblockRes, systemRes, networkRes, firewallRes, devicesRes, vpnRes] = await Promise.all([
        optional<any>(() => ubusClient.getAdblockStatus(), null),
        optional<any>(() => ubusClient.getSystemStatus(), null),
        optional<any>(() => ubusClient.getNetworkStats(wanDevice!), null),
        optional<any>(() => ubusClient.getFirewallRules(), null),
        optional<any>(() => ubusClient.getDevices(), null),
        optional<any>(() => ubusClient.getVpnStatus('wg0'), null),
      ]);

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const stats = networkRes?.statistics || { rx_bytes: 0, tx_bytes: 0 };

      const newHistory = [...trafficHistory, {
        time: now,
        rx: Math.floor(stats.rx_bytes / 1024 / 1024),
        tx: Math.floor(stats.tx_bytes / 1024 / 1024)
      }].slice(-20);

      // Extract devices from nested DHCP response
      const leaseData = devicesRes?.device || {};
      let allDevices: any[] = [];
      Object.values(leaseData).forEach((iface: any) => {
        if (iface.leases) allDevices = [...allDevices, ...iface.leases];
      });

      const guestSection = findGuestSection(wifiRes?.values);

      set({
        wifiConfig: wifiRes?.values || null,
        guestWifiSection: guestSection,
        adblockEnabled: isAdblockRunning(adblockRes),
        uptime: systemRes?.uptime || 0,
        trafficHistory: newHistory,
        firewallRules: firewallRes?.values || null,
        guestWifiEnabled: guestSection ? !isDisabled(wifiRes?.values?.[guestSection]?.disabled) : false,
        devices: allDevices,
        vpnStatus: vpnRes
          ? {
              up: !!vpnRes.up,
              ip: vpnRes['ipv4-address']?.[0]?.address || 'Not Connected',
              uptime: vpnRes.uptime || 0
            }
          : null,
        loading: false,
        // Clear a previous failure, otherwise the UI stays in the error state
        // after the router comes back.
        error: null
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

  toggleVpn: async () => {
    const nextState = !get().vpnStatus?.up;
    set({ loading: true });
    try {
      await ubusClient.toggleVpn(nextState, 'wg0');
      await get().fetchData();
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

  setDeviceSchedule: async (mac: string, startTime: string, stopTime: string, enabled: boolean) => {
    set({ loading: true });
    try {
      await ubusClient.setDeviceSchedule(mac, startTime, stopTime, enabled);
      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  toggleGuestWifi: async () => {
    const { guestWifiEnabled, guestWifiSection } = get();
    if (!guestWifiSection) {
      set({ settingsMessage: 'No guest network found in the router\'s wireless config.' });
      return;
    }
    set({ loading: true });
    try {
      await ubusClient.toggleGuestWifi(!guestWifiEnabled, guestWifiSection);
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

  setRouterIp: (ip: string, user: string, pass: string) => {
    localStorage.setItem('routerIp', ip);
    localStorage.setItem('routerUser', user);
    localStorage.setItem('routerPass', pass);
    wanDevice = null;
    set({ routerIp: ip, routerUser: user, routerPass: pass, wifiConfig: null, trafficHistory: [] });
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
  },

  saveSettingsBackup: () => {
    const { wifiConfig, adblockEnabled, guestWifiEnabled, vpnStatus } = get();
    if (!wifiConfig) {
      set({ error: null, settingsMessage: 'Cannot save: settings have not been loaded. Please connect to the router first.' });
      return;
    }

    const wifi: Record<string, { ssid: string; key: string }> = {};
    Object.entries(wifiConfig).forEach(([section, conf]) => {
      if (conf && typeof conf.ssid === 'string' && conf.ssid.length > 0) {
        wifi[section] = { ssid: conf.ssid, key: conf.key || '' };
      }
    });

    const backup: SettingsBackup = {
      savedAt: new Date().toISOString(),
      wifi,
      adblockEnabled,
      guestWifiEnabled,
      vpnEnabled: !!vpnStatus?.up
    };

    localStorage.setItem(SETTINGS_BACKUP_KEY, JSON.stringify(backup));
    set({ settingsBackupAt: backup.savedAt, error: null, settingsMessage: 'Settings snapshot saved.' });
  },

  restoreSettingsBackup: async () => {
    const raw = localStorage.getItem(SETTINGS_BACKUP_KEY);
    if (!raw) {
      set({ error: null, settingsMessage: 'No saved settings snapshot found.' });
      return;
    }

    let backup: SettingsBackup;
    try {
      backup = JSON.parse(raw) as SettingsBackup;
    } catch {
      set({ error: null, settingsMessage: 'Saved settings snapshot is corrupted and cannot be restored. Please save a new snapshot.' });
      return;
    }

    if (!window.confirm('Restore saved settings snapshot to the router?')) return;

    set({ loading: true, error: null });
    try {
      // Sequential: each write commits the same config, so parallel writes race.
      for (const [section, conf] of Object.entries(backup.wifi || {})) {
        await ubusClient.setWifiConfig(section, { ssid: conf.ssid, key: conf.key });
      }

      await ubusClient.setAdblockEnabled(!!backup.adblockEnabled);

      const guestSection = get().guestWifiSection;
      if (guestSection) {
        await ubusClient.toggleGuestWifi(!!backup.guestWifiEnabled, guestSection);
      }

      if (!!get().vpnStatus?.up !== !!backup.vpnEnabled) {
        await ubusClient.toggleVpn(!!backup.vpnEnabled, 'wg0');
      }

      await get().fetchData();
      set({ settingsMessage: 'Settings restored from snapshot.' });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  clearSettingsMessage: () => {
    set({ settingsMessage: null });
  },

  setTheme: (theme: 'light' | 'dark') => {
    localStorage.setItem('theme', theme);
    set({ theme });
  }
}));
