import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

interface MockStoreState {
  guestWifiEnabled: boolean;
  toggleGuestWifi: ReturnType<typeof vi.fn>;
  wifiConfig: Record<string, { ssid: string; key: string; disabled: number }> | null;
  guestWifiSection: string | null;
  pendingApply: null | unknown;
}

let mockState: MockStoreState = {
  guestWifiEnabled: true,
  toggleGuestWifi: vi.fn(),
  wifiConfig: {
    guest: { ssid: 'EZ-WRT-Guest', key: 'guestpassword123', disabled: 0 },
  },
  guestWifiSection: 'guest',
  pendingApply: null,
};

const mockUseStore = vi.fn((selector?: (s: MockStoreState) => unknown) => {
  return selector ? selector(mockState) : mockState;
});

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (s: MockStoreState) => unknown) => mockUseStore(selector),
}));

describe('GuestWifiModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      guestWifiEnabled: true,
      toggleGuestWifi: vi.fn(),
      wifiConfig: {
        guest: { ssid: 'EZ-WRT-Guest', key: 'guestpassword123', disabled: 0 },
      },
      guestWifiSection: 'guest',
      pendingApply: null,
    };
  });

  it('subscribes via granular selectors rather than whole store', async () => {
    const { GuestWifiModule } = await import('./GuestWifiModule');
    renderToString(React.createElement(GuestWifiModule));

    expect(mockUseStore).toHaveBeenCalled();
    // Verify that every useStore call used a granular selector function
    expect(mockUseStore.mock.calls.every((c) => typeof c[0] === 'function')).toBe(true);

    const selectorStrings = mockUseStore.mock.calls.map((c) => c[0]?.toString() || '');
    expect(selectorStrings.some((s) => s.includes('guestWifiEnabled'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('toggleGuestWifi'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('wifiConfig'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('guestWifiSection'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('pendingApply'))).toBe(true);
  });

  it('renders guest WiFi details and active status correctly', async () => {
    const { GuestWifiModule } = await import('./GuestWifiModule');
    const html = renderToString(React.createElement(GuestWifiModule));

    expect(html).toContain('Guest WiFi');
    expect(html).toContain('ON');
    expect(html).toContain('EZ-WRT-Guest');
    expect(html).toContain('guestpassword123');
    expect(html).toContain('Turn Off Guest WiFi');
  });

  it('renders inactive status when disabled', async () => {
    mockState = {
      ...mockState,
      guestWifiEnabled: false,
    };
    const { GuestWifiModule } = await import('./GuestWifiModule');
    const html = renderToString(React.createElement(GuestWifiModule));

    expect(html).toContain('OFF');
    expect(html).toContain('Turn On Guest WiFi');
  });

  it('disables toggle button when pendingApply is active', async () => {
    mockState = {
      ...mockState,
      pendingApply: {
        summary: 'Applying WiFi changes',
        expiresAt: Date.now() + 60000,
        timeout: 90,
      },
    };
    const { GuestWifiModule } = await import('./GuestWifiModule');
    const html = renderToString(React.createElement(GuestWifiModule));

    expect(html).toContain('disabled');
  });

  it('renders nothing when guest section is not found or not in wifiConfig', async () => {
    mockState = {
      ...mockState,
      guestWifiSection: null,
    };
    const { GuestWifiModule } = await import('./GuestWifiModule');
    const html = renderToString(React.createElement(GuestWifiModule));

    expect(html).toBe('');
  });
});
