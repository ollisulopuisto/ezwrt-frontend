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
