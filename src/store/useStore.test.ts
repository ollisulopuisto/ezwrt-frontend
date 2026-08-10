import { beforeEach, describe, expect, it, vi } from 'vitest';

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const WIFI = {
  values: {
    default_radio0: { device: 'radio0', ssid: 'EZ-WRT 2.4GHz', key: 'password123', disabled: '0' },
    guest: { device: 'radio0', ssid: 'EZ-Guest-WiFi', key: 'guestpass123', disabled: '1' },
  },
};

const makeClient = () => ({
  setBaseUrl: vi.fn(),
  setCredentials: vi.fn(),
  login: vi.fn().mockResolvedValue('session'),
  getWifiConfig: vi.fn().mockResolvedValue(WIFI),
  getWanDevice: vi.fn().mockResolvedValue('eth1'),
  getAdblockStatus: vi.fn().mockResolvedValue({ adblock: { instances: { instance1: { running: true } } } }),
  getSystemStatus: vi.fn().mockResolvedValue({ uptime: 120 }),
  getNetworkStats: vi.fn().mockResolvedValue({ statistics: { rx_bytes: 0, tx_bytes: 0 } }),
  getFirewallRules: vi.fn().mockResolvedValue({ values: {} }),
  getDevices: vi.fn().mockResolvedValue({ device: {} }),
  getVpnStatus: vi.fn().mockResolvedValue({ up: false, uptime: 0 }),
  toggleGuestWifi: vi.fn().mockResolvedValue(undefined),
});

type Client = ReturnType<typeof makeClient>;

const loadStore = async (client: Client) => {
  vi.resetModules();
  vi.doMock('../services/UbusClient', () => ({ ubusClient: client }));
  return import('./useStore');
};

describe('useStore theme', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  it('defaults to light theme and persists updates', async () => {
    const { useStore } = await import('./useStore');

    expect(useStore.getState().theme).toBe('light');

    useStore.getState().setTheme('dark');

    expect(useStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('initializes theme from localStorage', async () => {
    localStorage.setItem('theme', 'dark');

    const { useStore } = await import('./useStore');

    expect(useStore.getState().theme).toBe('dark');
  });
});

describe('useStore fetchData', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  it('clears a previous error once the router responds again', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();
    expect(useStore.getState().error).toBeNull();

    client.getWifiConfig.mockRejectedValueOnce(new Error('Network unreachable'));
    await useStore.getState().fetchData();
    expect(useStore.getState().error).toBe('Network unreachable');
    // Data from before the failure is kept so the dashboard can stay up.
    expect(useStore.getState().wifiConfig).not.toBeNull();

    await useStore.getState().fetchData();
    expect(useStore.getState().error).toBeNull();
  });

  it('keeps working when optional services are unavailable', async () => {
    const client = makeClient();
    client.getVpnStatus.mockRejectedValue(new Error('Not found'));
    client.getAdblockStatus.mockRejectedValue(new Error('Not found'));
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().vpnStatus).toBeNull();
    expect(useStore.getState().adblockEnabled).toBe(false);
    expect(useStore.getState().uptime).toBe(120);
  });

  it('detects the guest network and toggles that section', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(useStore.getState().guestWifiSection).toBe('guest');
    expect(useStore.getState().guestWifiEnabled).toBe(false);

    await useStore.getState().toggleGuestWifi();
    expect(client.toggleGuestWifi).toHaveBeenCalledWith(true, 'guest');
  });

  it('resolves the WAN device instead of assuming one', async () => {
    const client = makeClient();
    client.getWanDevice.mockResolvedValue('eth0.2');
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(client.getNetworkStats).toHaveBeenCalledWith('eth0.2');
  });
});

describe('findGuestSection', () => {
  it('finds guest networks that are not named "guest"', async () => {
    vi.stubGlobal('localStorage', new LocalStorageMock());
    const { findGuestSection } = await import('./useStore');

    expect(findGuestSection({
      wifinet0: { ssid: 'Home', key: '', disabled: 0 },
      wifinet1: { ssid: 'Home Guest', key: '', disabled: 1 },
    })).toBe('wifinet1');

    expect(findGuestSection({ wifinet0: { ssid: 'Home', key: '', disabled: 0 } })).toBeNull();
  });
});
