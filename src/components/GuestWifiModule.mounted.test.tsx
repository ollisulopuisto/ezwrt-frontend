// @vitest-environment happy-dom
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { GuestWifiModule } from './GuestWifiModule';

const initialState = useStore.getState();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  useStore.setState(initialState, true);
});

const wifi = (ssid: string, key: string) => ({
  guest: { ssid, key, disabled: 0 },
});

describe('GuestWifiModule mounted store subscriptions', () => {
  it('does not re-render when a poll replaces the config with identical guest settings', async () => {
    useStore.setState({
      wifiConfig: wifi('EZ-Guest', 'secret123') as never,
      guestWifiSection: 'guest',
      guestWifiEnabled: true,
      pendingApply: null,
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    let renders = 0;
    try {
      await act(async () => {
        root.render(<Profiler id="guest" onRender={() => { renders += 1; }}>
          <GuestWifiModule />
        </Profiler>);
      });
      const mountedRenders = renders;
      expect(container.textContent).toContain('EZ-Guest');

      // Same guest values, new object identity: what every 15 s poll produces.
      await act(async () => {
        useStore.setState({ wifiConfig: wifi('EZ-Guest', 'secret123') as never });
      });
      expect(renders).toBe(mountedRenders);

      // A real change still renders.
      await act(async () => {
        useStore.setState({ wifiConfig: wifi('EZ-Guest', 'changed456') as never });
      });
      expect(renders).toBeGreaterThan(mountedRenders);
      expect(container.textContent).toContain('changed456');
    } finally {
      await act(async () => { root.unmount(); });
    }
  });
});
