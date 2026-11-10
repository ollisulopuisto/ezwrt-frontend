import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

interface MockStoreState {
  routerIp: string;
  routerUser: string;
  routerPass: string;
  setRouterIp: ReturnType<typeof vi.fn>;
  fetchData: ReturnType<typeof vi.fn>;
  saveSettingsBackup: ReturnType<typeof vi.fn>;
  restoreSettingsBackup: ReturnType<typeof vi.fn>;
  settingsBackupAt: string | null;
  settingsMessage: string | null;
  clearSettingsMessage: ReturnType<typeof vi.fn>;
  pendingApply: null | unknown;
}

let mockState: MockStoreState = {
  routerIp: '192.168.1.1',
  routerUser: 'root',
  routerPass: 'secret',
  setRouterIp: vi.fn(),
  fetchData: vi.fn(),
  saveSettingsBackup: vi.fn(),
  restoreSettingsBackup: vi.fn(),
  settingsBackupAt: '2026-11-09T12:00:00.000Z',
  settingsMessage: 'Settings snapshot saved.',
  clearSettingsMessage: vi.fn(),
  pendingApply: null,
};

const mockUseStore = vi.fn((selector?: (s: MockStoreState) => unknown) => {
  return selector ? selector(mockState) : mockState;
});

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (s: MockStoreState) => unknown) => mockUseStore(selector),
}));

describe('SetupModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      routerIp: '192.168.1.1',
      routerUser: 'root',
      routerPass: 'secret',
      setRouterIp: vi.fn(),
      fetchData: vi.fn(),
      saveSettingsBackup: vi.fn(),
      restoreSettingsBackup: vi.fn(),
      settingsBackupAt: '2026-11-09T12:00:00.000Z',
      settingsMessage: 'Settings snapshot saved.',
      clearSettingsMessage: vi.fn(),
      pendingApply: null,
    };
  });

  it('subscribes via granular selectors rather than whole store', async () => {
    const { SetupModule } = await import('./SetupModule');
    renderToString(React.createElement(SetupModule));

    expect(mockUseStore).toHaveBeenCalled();
    // Verify that every useStore call used a granular selector function
    expect(mockUseStore.mock.calls.every((c) => typeof c[0] === 'function')).toBe(true);

    const selectorStrings = mockUseStore.mock.calls.map((c) => c[0]?.toString() || '');
    expect(selectorStrings.some((s) => s.includes('routerIp'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('routerUser'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('routerPass'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('setRouterIp'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('fetchData'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('saveSettingsBackup'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('restoreSettingsBackup'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('settingsBackupAt'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('settingsMessage'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('clearSettingsMessage'))).toBe(true);
    expect(selectorStrings.some((s) => s.includes('pendingApply'))).toBe(true);
  });

  it('renders router connection fields, buttons, and hints', async () => {
    const { SetupModule } = await import('./SetupModule');
    const html = renderToString(React.createElement(SetupModule));

    expect(html).toContain('Router Connection');
    expect(html).toContain('Current:');
    expect(html).toContain('192.168.1.1');
    expect(html).toContain('Use Local Mock');
    expect(html).toContain('Update &amp; Connect');
    expect(html).toContain('Save Settings Snapshot');
    expect(html).toContain('Restore Saved Snapshot');
    expect(html).toContain('Saved:');
    expect(html).toContain('Settings snapshot saved.');
  });

  it('disables restore button when pendingApply is present', async () => {
    mockState = {
      ...mockState,
      pendingApply: {
        summary: 'Applying change',
        expiresAt: Date.now() + 60000,
        timeout: 90,
      },
    };
    const { SetupModule } = await import('./SetupModule');
    const html = renderToString(React.createElement(SetupModule));

    expect(html).toContain('disabled');
  });

  it('omits backup timestamp and message when not present', async () => {
    mockState = {
      ...mockState,
      settingsBackupAt: null,
      settingsMessage: null,
    };
    const { SetupModule } = await import('./SetupModule');
    const html = renderToString(React.createElement(SetupModule));

    expect(html).not.toContain('setup-message');
    expect(html).not.toContain('Saved:');
  });
});
