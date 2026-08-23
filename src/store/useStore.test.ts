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
  getSqmConfig: vi.fn().mockResolvedValue({ values: {} }),
  setFlowOffloading: vi.fn().mockResolvedValue(undefined),
  getDevices: vi.fn().mockResolvedValue({ device: {} }),
  getVpnStatus: vi.fn().mockResolvedValue({ up: false, uptime: 0 }),
  toggleGuestWifi: vi.fn().mockResolvedValue(undefined),
  setAdblockEnabled: vi.fn().mockResolvedValue(undefined),
  setWifiConfig: vi.fn().mockResolvedValue(undefined),
  applyChanges: vi.fn().mockResolvedValue('rollback'),
  confirmChanges: vi.fn().mockResolvedValue(undefined),
  rollbackChanges: vi.fn().mockResolvedValue(undefined),
});

type Client = ReturnType<typeof makeClient>;

const loadStore = async (client: Client) => {
  vi.resetModules();
  // The error class and status codes come from the real module: the store does
  // `instanceof UbusError`, which silently breaks against a hand-rolled stand-in.
  const actual = await vi.importActual<typeof import('../services/UbusClient')>(
    '../services/UbusClient'
  );
  // Spread the real module and override only the client: naming exports by hand
  // means a later-added one silently arrives as `undefined`, which is how an
  // `instanceof` check or a constant can break without the test noticing.
  vi.doMock('../services/UbusClient', () => ({
    ...actual,
    ubusClient: client,
    APPLY_TIMEOUT_SECONDS: 90,
  }));
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

describe('flow offloading', () => {
  const FIREWALL_OFFLOAD_OFF = {
    values: {
      cfg01e63b: { '.type': 'defaults', input: 'ACCEPT', flow_offloading: '0' },
      redirect0: { '.type': 'redirect', name: 'HTTP' },
    },
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  it('locates the anonymous defaults section and reads the current state', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(useStore.getState().flowOffloadingSection).toBe('cfg01e63b');
    expect(useStore.getState().flowOffloading).toBe(false);
  });

  it('stays hidden when the router has no defaults section to write to', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue({ values: { redirect0: { '.type': 'redirect' } } });
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    // null is what the component keys off to render nothing at all.
    expect(useStore.getState().flowOffloading).toBeNull();
    expect(useStore.getState().flowOffloadingSection).toBeNull();
  });

  it('enables offloading through the rollback-protected apply path', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();
    await useStore.getState().setFlowOffloading(true);

    expect(client.setFlowOffloading).toHaveBeenCalledWith('cfg01e63b', true);
    expect(client.applyChanges).toHaveBeenCalledWith(['firewall']);
    // Same safety net as every other change, not a special case.
    expect(useStore.getState().pendingApply).not.toBeNull();
  });

  it('refuses to enable it when SQM is shaping traffic', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    client.getSqmConfig.mockResolvedValue({
      values: { eth1: { '.type': 'queue', enabled: '1' } },
    });
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();
    expect(useStore.getState().sqmActive).toBe(true);

    await useStore.getState().setFlowOffloading(true);

    expect(client.setFlowOffloading).not.toHaveBeenCalled();
    expect(useStore.getState().settingsMessage).toMatch(/SQM/);
  });

  it('still allows turning it off while SQM is on', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue({
      values: { cfg01e63b: { '.type': 'defaults', flow_offloading: '1' } },
    });
    client.getSqmConfig.mockResolvedValue({
      values: { eth1: { '.type': 'queue', enabled: '1' } },
    });
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();
    await useStore.getState().setFlowOffloading(false);

    expect(client.setFlowOffloading).toHaveBeenCalledWith('cfg01e63b', false);
  });

  it('treats a disabled SQM queue as no shaping', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    client.getSqmConfig.mockResolvedValue({
      values: { eth1: { '.type': 'queue', enabled: '0' } },
    });
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(useStore.getState().sqmActive).toBe(false);
  });

  it('reads a missing sqm config as "not installed", not as "unknown"', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    // Must come from the module instance the store itself loaded: a separate
    // importActual returns a distinct class, and `instanceof` then never matches.
    const { UbusError, UBUS_STATUS_NOT_FOUND } = await import('../services/UbusClient');
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    client.getSqmConfig.mockRejectedValue(
      new UbusError('uci', 'get', UBUS_STATUS_NOT_FOUND)
    );

    await useStore.getState().fetchData();

    expect(useStore.getState().sqmActive).toBe(false);
  });

  it('reports "unknown" when the ACL will not let it read sqm', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    const { UbusError, UBUS_STATUS_PERMISSION_DENIED } = await import('../services/UbusClient');
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    client.getSqmConfig.mockRejectedValue(
      new UbusError('uci', 'get', UBUS_STATUS_PERMISSION_DENIED)
    );

    await useStore.getState().fetchData();

    // An install predating the sqm grant must not be told there is no shaping.
    expect(useStore.getState().sqmActive).toBeNull();
    // ...and the offer still stands, with the caveat shown in the UI.
    expect(useStore.getState().flowOffloading).toBe(false);
  });

  it('does not block the dashboard when sqm cannot be read', async () => {
    const client = makeClient();
    client.getFirewallRules.mockResolvedValue(FIREWALL_OFFLOAD_OFF);
    client.getSqmConfig.mockRejectedValue(new Error('boom'));
    const { useStore } = await loadStore(client);

    await useStore.getState().fetchData();

    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().wifiConfig).not.toBeNull();
  });
});

describe('findDefaultsSection', () => {
  it('finds the defaults section whatever UCI called it', async () => {
    const { findDefaultsSection } = await loadStore(makeClient());
    expect(
      findDefaultsSection({
        cfg02dd81: { '.type': 'zone', name: 'lan' },
        cfg9c81ab: { '.type': 'defaults', input: 'ACCEPT' },
      })
    ).toBe('cfg9c81ab');
    expect(findDefaultsSection({ cfg02dd81: { '.type': 'zone' } })).toBeNull();
    expect(findDefaultsSection(null)).toBeNull();
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

describe('apply with rollback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  it('applies with a rollback timer and waits for confirmation', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();

    await useStore.getState().toggleAdblock();

    expect(client.applyChanges).toHaveBeenCalledWith(['adblock']);
    const pending = useStore.getState().pendingApply;
    expect(pending).not.toBeNull();
    expect(pending!.summary).toMatch(/Adblock/);
    expect(pending!.expiresAt).toBeGreaterThan(Date.now());
    // Persisted so a disconnected user can still confirm after reconnecting.
    expect(localStorage.getItem('ezwrtPendingApplyV1')).toContain('expiresAt');
  });

  it('keeps the change when the user confirms', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();
    await useStore.getState().toggleAdblock();

    await useStore.getState().confirmApply();

    expect(client.confirmChanges).toHaveBeenCalled();
    expect(useStore.getState().pendingApply).toBeNull();
    expect(localStorage.getItem('ezwrtPendingApplyV1')).toBeNull();
  });

  it('reverts on request', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();
    await useStore.getState().toggleAdblock();

    await useStore.getState().revertApply();

    expect(client.rollbackChanges).toHaveBeenCalled();
    expect(useStore.getState().pendingApply).toBeNull();
    expect(useStore.getState().settingsMessage).toMatch(/reverted/i);
  });

  it('reports the router-side rollback when the timer runs out', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();
    await useStore.getState().toggleAdblock();

    await useStore.getState().applyExpired();

    expect(useStore.getState().pendingApply).toBeNull();
    expect(useStore.getState().settingsMessage).toMatch(/restored the previous settings/i);
  });

  it('refuses to stack a second change onto an unconfirmed one', async () => {
    const client = makeClient();
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();
    await useStore.getState().toggleAdblock();

    await useStore.getState().toggleGuestWifi();

    expect(client.toggleGuestWifi).not.toHaveBeenCalled();
    expect(useStore.getState().settingsMessage).toMatch(/Confirm or revert/i);
  });

  it('says so when the router cannot roll back', async () => {
    const client = makeClient();
    client.applyChanges.mockResolvedValue('committed');
    const { useStore } = await loadStore(client);
    await useStore.getState().fetchData();

    await useStore.getState().toggleAdblock();

    expect(useStore.getState().pendingApply).toBeNull();
    expect(useStore.getState().settingsMessage).toMatch(/does not support automatic rollback/i);
  });

  it('restores a persisted pending apply after a reload', async () => {
    vi.stubGlobal('localStorage', new LocalStorageMock());
    localStorage.setItem('ezwrtPendingApplyV1', JSON.stringify({
      summary: 'WiFi network "Home" updated',
      expiresAt: Date.now() + 60000,
      timeout: 90,
    }));

    const { useStore } = await loadStore(makeClient());

    expect(useStore.getState().pendingApply?.summary).toMatch(/WiFi network/);
  });

  it('drops a pending apply whose timer already expired', async () => {
    vi.stubGlobal('localStorage', new LocalStorageMock());
    localStorage.setItem('ezwrtPendingApplyV1', JSON.stringify({
      summary: 'stale',
      expiresAt: Date.now() - 1000,
      timeout: 90,
    }));

    const { useStore } = await loadStore(makeClient());

    expect(useStore.getState().pendingApply).toBeNull();
  });
});
