// @vitest-environment happy-dom
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { PerformanceModule } from './PerformanceModule';

const initialState = useStore.getState();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  useStore.setState(initialState, true);
});

describe('PerformanceModule mounted store subscriptions', () => {
  it('ignores unrelated polling updates but renders changed controls', async () => {
    useStore.setState({ flowOffloading: false, sqmActive: false, pendingApply: null });
    const container = document.createElement('div');
    const root = createRoot(container);
    let renders = 0;
    try {
      await act(async () => {
        root.render(<Profiler id="performance" onRender={() => { renders += 1; }}>
          <PerformanceModule />
        </Profiler>);
      });
      const mountedRenders = renders;
      expect(container.textContent).toContain('Turn On Fast Forwarding');
      await act(async () => {
        useStore.setState({ uptime: initialState.uptime + 15 });
      });
      expect(renders).toBe(mountedRenders);
      await act(async () => {
        useStore.setState({ trafficHistory: [...initialState.trafficHistory] });
      });
      expect(renders).toBe(mountedRenders);

      await act(async () => { useStore.setState({ sqmActive: true }); });
      expect(renders).toBeGreaterThan(mountedRenders);
      expect(container.textContent).toContain('Not Available (SQM Is On)');
      expect(container.querySelector('button')?.disabled).toBe(true);
      await act(async () => { useStore.setState({ flowOffloading: true }); });
      expect(container.textContent).toContain('Turn Off Fast Forwarding');
      expect(container.querySelector('button')?.disabled).toBe(false);
      await act(async () => {
        useStore.setState({ pendingApply: { summary: 'Test', expiresAt: Date.now() + 90000, timeout: 90 } });
      });
      expect(container.querySelector('button')?.disabled).toBe(true);
    } finally {
      await act(async () => { root.unmount(); });
    }
  });
});
