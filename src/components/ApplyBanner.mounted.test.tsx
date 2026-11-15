// @vitest-environment happy-dom
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { ApplyBanner } from './ApplyBanner';

const initialState = useStore.getState();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  useStore.setState(initialState, true);
});

describe('ApplyBanner mounted store subscriptions', () => {
  it('does not re-render on unrelated polling updates when no apply is pending', async () => {
    useStore.setState({ ...initialState, pendingApply: null, uptime: initialState.uptime });
    const container = document.createElement('div');
    const root = createRoot(container);
    let renders = 0;
    try {
      await act(async () => {
        root.render(<Profiler id="apply" onRender={() => { renders += 1; }}>
          <ApplyBanner />
        </Profiler>);
      });
      const mountedRenders = renders;
      expect(container.textContent).not.toContain('Still connected');

      // Simulate a 15 s poll that touches uptime/trafficHistory/devices —
      // nothing about the pending apply changed.
      await act(async () => {
        useStore.setState({ uptime: initialState.uptime + 15 });
      });
      expect(renders).toBe(mountedRenders);
    } finally {
      await act(async () => { root.unmount(); });
    }
  });

  it('still re-renders when the pending apply actually changes', async () => {
    useStore.setState({ ...initialState, pendingApply: null });
    const container = document.createElement('div');
    const root = createRoot(container);
    let renders = 0;
    try {
      await act(async () => {
        root.render(<Profiler id="apply" onRender={() => { renders += 1; }}>
          <ApplyBanner />
        </Profiler>);
      });
      const mountedRenders = renders;

      await act(async () => {
        useStore.setState({
          pendingApply: { summary: 'Test', expiresAt: Date.now() + 90000, timeout: 90 },
        });
      });
      expect(renders).toBeGreaterThan(mountedRenders);
      expect(container.textContent).toContain('Still connected');
    } finally {
      await act(async () => { root.unmount(); });
    }
  });
});
