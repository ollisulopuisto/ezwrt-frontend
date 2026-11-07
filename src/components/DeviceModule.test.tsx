import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

let mockState: {
  devices: Array<{ hostname: string; ip: string; mac: string }>;
  toggleDeviceInternet: ReturnType<typeof vi.fn>;
  setDeviceSchedule: ReturnType<typeof vi.fn>;
  firewallRules: Record<string, { target?: string; enabled?: string }> | null;
  pendingApply: null | unknown;
} = {
  devices: [
    { hostname: 'Pixel-8', ip: '192.168.1.150', mac: '00:11:22:33:44:55' },
  ],
  toggleDeviceInternet: vi.fn(),
  setDeviceSchedule: vi.fn(),
  firewallRules: {
    block_001122334455: {
      target: 'REJECT',
      enabled: '1',
    },
  },
  pendingApply: null,
};

const mockUseStore = vi.fn((selector?: (s: typeof mockState) => unknown) => {
  return selector ? selector(mockState) : mockState;
});

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (s: typeof mockState) => unknown) => mockUseStore(selector),
}));

describe('DeviceModule', () => {
  it('subscribes via granular selectors rather than entire store', async () => {
    mockUseStore.mockClear();
    const { DeviceModule } = await import('./DeviceModule');
    renderToString(React.createElement(DeviceModule));

    // Confirm that useStore was called with specific selectors to avoid subscribing to all store changes
    expect(mockUseStore).toHaveBeenCalled();
    const selectors = mockUseStore.mock.calls.map(c => c[0]?.toString() || '');
    expect(selectors.length).toBeGreaterThanOrEqual(5);
    expect(selectors.some(s => s.includes('devices'))).toBe(true);
    expect(selectors.some(s => s.includes('firewallRules'))).toBe(true);
    expect(selectors.some(s => s.includes('pendingApply'))).toBe(true);
  });

  it('renders connected devices correctly', async () => {
    const { DeviceModule } = await import('./DeviceModule');

    const html = renderToString(React.createElement(DeviceModule));
    expect(html).toContain('Pixel-8');
    expect(html).toContain('192.168.1.150');
    expect(html).toContain('00:11:22:33:44:55');
    expect(html).toContain('paused');
  });

  it('renders empty state when there are no devices', async () => {
    mockState = {
      ...mockState,
      devices: [],
      firewallRules: null,
    };
    const { DeviceModule } = await import('./DeviceModule');

    const html = renderToString(React.createElement(DeviceModule));
    expect(html).toContain('No devices found.');
  });
});
