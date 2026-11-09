import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

interface MockStoreState {
  flowOffloading: boolean | null;
  sqmActive: boolean | null;
  setFlowOffloading: ReturnType<typeof vi.fn>;
  pendingApply: null | unknown;
}

let mockState: MockStoreState = {
  flowOffloading: false,
  sqmActive: false,
  setFlowOffloading: vi.fn(),
  pendingApply: null,
};

const mockUseStore = vi.fn((selector?: (s: MockStoreState) => unknown) => {
  return selector ? selector(mockState) : mockState;
});

vi.mock('../store/useStore', () => ({
  useStore: (selector?: (s: MockStoreState) => unknown) => mockUseStore(selector),
}));

describe('PerformanceModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      flowOffloading: false,
      sqmActive: false,
      setFlowOffloading: vi.fn(),
      pendingApply: null,
    };
  });

  it('subscribes via granular selectors rather than whole store', async () => {
    const { PerformanceModule } = await import('./PerformanceModule');
    renderToString(React.createElement(PerformanceModule));

    expect(mockUseStore).toHaveBeenCalled();
    const selectors = mockUseStore.mock.calls.map((c) => c[0]?.toString() || '');
    // Ensure every call used a selector function rather than subscribing with no arguments
    expect(mockUseStore.mock.calls.every((c) => typeof c[0] === 'function')).toBe(true);
    expect(selectors.some((s) => s.includes('flowOffloading'))).toBe(true);
    expect(selectors.some((s) => s.includes('sqmActive'))).toBe(true);
    expect(selectors.some((s) => s.includes('setFlowOffloading'))).toBe(true);
    expect(selectors.some((s) => s.includes('pendingApply'))).toBe(true);
  });

  it('renders fast forwarding as OFF when flowOffloading is false', async () => {
    const { PerformanceModule } = await import('./PerformanceModule');
    const html = renderToString(React.createElement(PerformanceModule));

    expect(html).toContain('Fast Forwarding');
    expect(html).toContain('OFF');
    expect(html).toContain('Turn On Fast Forwarding');
  });

  it('renders fast forwarding as ON when flowOffloading is true', async () => {
    mockState = {
      ...mockState,
      flowOffloading: true,
    };
    const { PerformanceModule } = await import('./PerformanceModule');
    const html = renderToString(React.createElement(PerformanceModule));

    expect(html).toContain('Fast Forwarding');
    expect(html).toContain('ON');
    expect(html).toContain('Turn Off Fast Forwarding');
  });

  it('returns null when flowOffloading is null', async () => {
    mockState = {
      ...mockState,
      flowOffloading: null,
    };
    const { PerformanceModule } = await import('./PerformanceModule');
    const html = renderToString(React.createElement(PerformanceModule));

    expect(html).toBe('');
  });

  it('indicates SQM conflict when SQM is active and flow offloading is off', async () => {
    mockState = {
      ...mockState,
      flowOffloading: false,
      sqmActive: true,
    };
    const { PerformanceModule } = await import('./PerformanceModule');
    const html = renderToString(React.createElement(PerformanceModule));

    expect(html).toContain('Not recommended on this router');
    expect(html).toContain('Not Available (SQM Is On)');
  });
});
