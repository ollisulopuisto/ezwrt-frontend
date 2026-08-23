import { create } from 'zustand';
import {
  ubusClient,
  APPLY_TIMEOUT_SECONDS,
  UbusError,
  UBUS_STATUS_NOT_FOUND,
} from '../services/UbusClient';

/**
 * A change is applied with a rollback timer: if the user cannot confirm it —
 * because the change itself cut their connection — the router restores the
 * previous configuration on its own.
 */
export interface PendingApply {
  summary: string;
  expiresAt: number;
  timeout: number;
}

const PENDING_APPLY_KEY = 'ezwrtPendingApplyV1';

// Survives a reload, so a user who gets disconnected by their own change can
// reconnect and still confirm it before the router reverts.
const readPendingApply = (): PendingApply | null => {
  try {
    const raw = localStorage.getItem(PENDING_APPLY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingApply;
    if (typeof parsed?.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(PENDING_APPLY_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writePendingApply = (pending: PendingApply | null) => {
  if (pending) {
    localStorage.setItem(PENDING_APPLY_KEY, JSON.stringify(pending));
  } else {
    localStorage.removeItem(PENDING_APPLY_KEY);
  }
};

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

const isEnabled = (value: unknown) => value === 1 || value === '1' || value === true;

/**
 * `config defaults` in /etc/config/firewall is an unnamed section, so UCI gives
 * it a generated name (`cfg01e63b` and the like) that differs per router. It has
 * to be located by type rather than assumed.
 */
export const findDefaultsSection = (
  values: Record<string, any> | null | undefined
): string | null => {
  const match = Object.entries(values || {}).find(([, conf]) => conf?.['.type'] === 'defaults');
  return match ? match[0] : null;
};

/**
 * True when at least one SQM instance is enabled. `null` means we could not
 * read the sqm config at all — most often an older ACL that predates the grant,
 * which must not be reported as "no shaping configured".
 */
export const readSqmActive = (values: Record<string, any> | null | undefined): boolean =>
  Object.values(values || {}).some(
    (conf: any) => conf?.['.type'] === 'queue' && isEnabled(conf?.enabled)
  );

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
  /** null when the firewall config has no readable `defaults` section. */
  flowOffloading: boolean | null;
  flowOffloadingSection: string | null;
  /** null means undetermined (e.g. the ACL does not grant reading `sqm`). */
  sqmActive: boolean | null;
  guestWifiEnabled: boolean;
  devices: any[];
  vpnStatus: { up: boolean, ip: string, uptime: number } | null;
  settingsBackupAt: string | null;
  settingsMessage: string | null;
  pendingApply: PendingApply | null;

  fetchData: () => Promise<void>;
  confirmApply: () => Promise<void>;
  revertApply: () => Promise<void>;
  applyExpired: () => Promise<void>;
  updateWifi: (section: string, ssid: string, key: string) => Promise<void>;
  toggleAdblock: () => Promise<void>;
  setRouterIp: (ip: string, user: string, pass: string) => void;
  rebootRouter: () => Promise<void>;
  addFirewallRule: (rule: any) => Promise<void>;
  toggleGuestWifi: () => Promise<void>;
  setFlowOffloading: (enabled: boolean) => Promise<void>;
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

export const useStore = create<AppState>((set, get) => {
  /**
   * Stage a change, apply it with a rollback timer, and hand the user the
   * confirm/revert decision. Only one change can be in flight: rpcd allows a
   * single pending apply, and stacking changes onto an unconfirmed one would
   * make the rollback point meaningless.
   */
  const runChange = async (
    config: string | string[],
    summary: string,
    mutate: () => Promise<void>,
    afterApply?: () => Promise<void>
  ) => {
    if (get().pendingApply) {
      set({ settingsMessage: 'Confirm or revert the pending change first.' });
      return;
    }

    set({ loading: true });
    try {
      await mutate();
      const mode = await ubusClient.applyChanges(
        Array.isArray(config) ? config : [config]
      );
      if (afterApply) await afterApply();

      if (mode === 'rollback') {
        const pending: PendingApply = {
          summary,
          expiresAt: Date.now() + APPLY_TIMEOUT_SECONDS * 1000,
          timeout: APPLY_TIMEOUT_SECONDS,
        };
        writePendingApply(pending);
        set({ pendingApply: pending });
      } else {
        set({
          settingsMessage: 'Applied. This router does not support automatic rollback.',
        });
      }

      await get().fetchData();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  };

  return {
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
    flowOffloading: null,
    flowOffloadingSection: null,
    sqmActive: null,
    guestWifiEnabled: false,
    devices: [],
    vpnStatus: null,
    settingsBackupAt: readBackupTimestamp(),
    settingsMessage: null,
    pendingApply: readPendingApply(),

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

        // Kept apart from the batch above: `null` here means "could not read it",
        // which is a different answer from "no shaping configured".
        let sqmValues: Record<string, any> | null = null;
        let sqmReadable = true;
        try {
          sqmValues = ((await ubusClient.getSqmConfig()) as any)?.values || {};
        } catch (err) {
          // No sqm config at all means the package is not installed, so there is
          // no shaping to protect. Anything else (a denial from an ACL that
          // predates the grant) leaves us genuinely unable to tell.
          if (err instanceof UbusError && err.code === UBUS_STATUS_NOT_FOUND) {
            sqmValues = {};
          } else {
            sqmReadable = false;
          }
        }

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
        const defaultsSection = findDefaultsSection(firewallRes?.values);

        set({
          wifiConfig: wifiRes?.values || null,
          guestWifiSection: guestSection,
          adblockEnabled: isAdblockRunning(adblockRes),
          uptime: systemRes?.uptime || 0,
          trafficHistory: newHistory,
          firewallRules: firewallRes?.values || null,
          flowOffloadingSection: defaultsSection,
          flowOffloading: defaultsSection
            ? isEnabled(firewallRes?.values?.[defaultsSection]?.flow_offloading)
            : null,
          sqmActive: sqmReadable ? readSqmActive(sqmValues) : null,
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

    confirmApply: async () => {
      if (!get().pendingApply) return;
      try {
        await ubusClient.confirmChanges();
        writePendingApply(null);
        set({ pendingApply: null, settingsMessage: 'Change confirmed and kept.' });
      } catch (err: any) {
        // The timer is still running: say so rather than implying it is safe.
        set({ error: `Could not confirm the change (${err.message}). It will be rolled back unless you retry.` });
      }
    },

    revertApply: async () => {
      if (!get().pendingApply) return;
      set({ loading: true });
      try {
        await ubusClient.rollbackChanges();
      } catch {
        // Rolling back early is best-effort; the router's timer still fires.
      }
      writePendingApply(null);
      set({ pendingApply: null, settingsMessage: 'Change reverted.' });
      await get().fetchData();
    },

    applyExpired: async () => {
      if (!get().pendingApply) return;
      writePendingApply(null);
      set({
        pendingApply: null,
        settingsMessage: 'No confirmation received — the router restored the previous settings.'
      });
      await get().fetchData();
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
      await runChange(
        'network',
        nextState ? 'VPN connected' : 'VPN disconnected',
        async () => {
          await ubusClient.toggleVpn(nextState, 'wg0');
        },
        // Routing every packet through the tunnel is the change most likely to
        // strand the user, so bring the interface up only after the apply.
        () => ubusClient.setInterfaceUp(nextState, 'wg0')
      );
    },

    toggleDeviceInternet: async (mac: string, block: boolean) => {
      await runChange(
        'firewall',
        `${block ? 'Paused' : 'Resumed'} internet for ${mac}`,
        () => ubusClient.toggleDeviceInternet(mac, block)
      );
    },

    setDeviceSchedule: async (mac: string, startTime: string, stopTime: string, enabled: boolean) => {
      await runChange(
        'firewall',
        enabled ? `Bedtime ${startTime}-${stopTime} for ${mac}` : `Bedtime disabled for ${mac}`,
        () => ubusClient.setDeviceSchedule(mac, startTime, stopTime, enabled)
      );
    },

    setFlowOffloading: async (enabled: boolean) => {
      const { flowOffloadingSection, sqmActive } = get();
      if (!flowOffloadingSection) {
        set({ settingsMessage: 'No firewall defaults section found on this router.' });
        return;
      }
      // Turning it off is always allowed; the SQM conflict only argues against
      // turning it on.
      if (enabled && sqmActive) {
        set({
          settingsMessage:
            'Not enabled: this router runs SQM. Offloaded traffic skips the shaper, which would undo the bufferbloat control SQM provides.',
        });
        return;
      }
      await runChange(
        'firewall',
        enabled ? 'Fast forwarding turned on' : 'Fast forwarding turned off',
        () => ubusClient.setFlowOffloading(flowOffloadingSection, enabled)
      );
    },

    toggleGuestWifi: async () => {
      const { guestWifiEnabled, guestWifiSection } = get();
      if (!guestWifiSection) {
        set({ settingsMessage: 'No guest network found in the router\'s wireless config.' });
        return;
      }
      await runChange(
        'wireless',
        guestWifiEnabled ? 'Guest WiFi turned off' : 'Guest WiFi turned on',
        () => ubusClient.toggleGuestWifi(!guestWifiEnabled, guestWifiSection)
      );
    },

    addFirewallRule: async (rule: any) => {
      await runChange(
        'firewall',
        `Port forward "${rule.name || 'unnamed'}" added`,
        () => ubusClient.addFirewallRule(rule)
      );
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
      await runChange(
        'wireless',
        `WiFi network "${ssid}" updated`,
        () => ubusClient.setWifiConfig(section, { ssid, key })
      );
    },

    toggleAdblock: async () => {
      const nextState = !get().adblockEnabled;
      await runChange(
        'adblock',
        nextState ? 'Adblock enabled' : 'Adblock disabled',
        () => ubusClient.setAdblockEnabled(nextState)
      );
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

      const vpnChanged = !!get().vpnStatus?.up !== !!backup.vpnEnabled;

      // The whole snapshot is staged and applied as one rollback-protected
      // change, so a bad snapshot cannot strand the user either.
      await runChange(
        ['wireless', 'adblock', 'network'],
        'Settings restored from snapshot',
        async () => {
          // Sequential: these writes touch the same configs.
          for (const [section, conf] of Object.entries(backup.wifi || {})) {
            await ubusClient.setWifiConfig(section, { ssid: conf.ssid, key: conf.key });
          }

          await ubusClient.setAdblockEnabled(!!backup.adblockEnabled);

          const guestSection = get().guestWifiSection;
          if (guestSection) {
            await ubusClient.toggleGuestWifi(!!backup.guestWifiEnabled, guestSection);
          }

          if (vpnChanged) {
            await ubusClient.toggleVpn(!!backup.vpnEnabled, 'wg0');
          }
        },
        vpnChanged ? () => ubusClient.setInterfaceUp(!!backup.vpnEnabled, 'wg0') : undefined
      );
    },

    clearSettingsMessage: () => {
      set({ settingsMessage: null });
    },

    setTheme: (theme: 'light' | 'dark') => {
      localStorage.setItem('theme', theme);
      set({ theme });
    }
  };
});
