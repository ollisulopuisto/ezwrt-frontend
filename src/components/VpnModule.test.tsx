import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

interface MockStoreState {
  vpnStatus: { up: boolean; ip: string; uptime: number } | null;
  toggleVpn: ReturnType<typeof vi.fn>;
  pendingApply: null | unknown;
}

let mockState: MockStoreState = {
  vpnStatus: {
    up: true,
    ip: '10.0.0.2',
    uptime: 120,
  },
  toggleVpn: vi.fn(),
  pendingApply: null,
};

const mockUseStore = vi.fn((selector?: (s: MockStoreState) => unknown) => {
  return selector ? selector(mockState) : mockState;
});

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (s: MockStoreState) => unknown) => mockUseStore(selector),
}));

describe('VpnModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      vpnStatus: {
        up: true,
        ip: '10.0.0.2',
        uptime: 120,
      },
      toggleVpn: vi.fn(),
      pendingApply: null,
    };
  });

  it('subscribes via granular selectors rather than whole store', async () => {
    const { VpnModule } = await import('./VpnModule');
    renderToString(React.createElement(VpnModule));

    expect(mockUseStore).toHaveBeenCalled();
    const selectors = mockUseStore.mock.calls.map(c => c[0]?.toString() || '');
    // Ensure that every call used a selector function rather than subscribing without arguments
    expect(mockUseStore.mock.calls.every(c => typeof c[0] === 'function')).toBe(true);
    expect(selectors.some(s => s.includes('vpnStatus'))).toBe(true);
    expect(selectors.some(s => s.includes('toggleVpn'))).toBe(true);
    expect(selectors.some(s => s.includes('pendingApply'))).toBe(true);
  });

  it('renders connected VPN status correctly', async () => {
    const { VpnModule } = await import('./VpnModule');
    const html = renderToString(React.createElement(VpnModule));

    expect(html).toContain('PROTECTED');
    expect(html).toContain('10.0.0.2');
    expect(html).toContain('Connection Time');
    expect(html).toContain('minutes');
    expect(html).toContain('Disconnect VPN');
  });

  it('renders disconnected VPN status correctly', async () => {
    mockState = {
      ...mockState,
      vpnStatus: {
        up: false,
        ip: 'Not Connected',
        uptime: 0,
      },
    };
    const { VpnModule } = await import('./VpnModule');
    const html = renderToString(React.createElement(VpnModule));

    expect(html).toContain('UNPROTECTED');
    expect(html).toContain('Connect VPN');
  });

  it('returns null when vpnStatus is null', async () => {
    mockState = {
      ...mockState,
      vpnStatus: null,
    };
    const { VpnModule } = await import('./VpnModule');
    const html = renderToString(React.createElement(VpnModule));

    expect(html).toBe('');
  });
});
