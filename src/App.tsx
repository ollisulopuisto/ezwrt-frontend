import React, { useEffect, Suspense, lazy } from 'react';
import { useStore } from './store/useStore';
import { AdblockModule } from './components/AdblockModule';
import { SetupModule } from './components/SetupModule';
import { FirewallModule } from './components/FirewallModule';
import { GuestWifiModule } from './components/GuestWifiModule';
import { DeviceModule } from './components/DeviceModule';
import { VpnModule } from './components/VpnModule';
import { PerformanceModule } from './components/PerformanceModule';
import { ApplyBanner } from './components/ApplyBanner';

// Heavy modules lazy loaded
const WiFiModule = lazy(() => import('./components/WiFiModule').then(m => ({ default: m.WiFiModule })));
const StatusModule = lazy(() => import('./components/StatusModule').then(m => ({ default: m.StatusModule })));

import './styles/main.css';
import './styles/firewall.css';
import './styles/guest.css';
import './styles/devices.css';
import './styles/vpn.css';

// Each poll is a batch of authenticated ubus calls, so it is not free —
// especially for the packaged phone app sitting in the background.
const POLL_INTERVAL_MS = 15000;

const App: React.FC = () => {
  const { fetchData, loading, error, theme, setTheme, wifiConfig, routerIp } = useStore();
  const connected = !!wifiConfig;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      // Refresh immediately on return, rather than waiting out an interval.
      fetchData();
      interval = setInterval(fetchData, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };

    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchData]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="container">
      <header>
        <h1>EZ-WRT</h1>
        <p className="subtitle">Simple Router Management</p>
        <button className="btn-small theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
      </header>
      <main>
        <ApplyBanner />
        <SetupModule />
        {loading && !connected && <div className="loading">Connecting to Router...</div>}
        {error && <div className="error">Error connecting to {routerIp}: {error}</div>}
        {/* Once connected, a failed poll shows the banner but keeps the dashboard. */}
        {(connected || (!loading && !error)) && (
          <Suspense fallback={<div className="loading">Loading Module...</div>}>
            <div className="left-column">
              <StatusModule />
              <VpnModule />
              <PerformanceModule />
              <FirewallModule />
            </div>
            <div className="right-column">
              <WiFiModule />
              <DeviceModule />
              <AdblockModule />
              <GuestWifiModule />
            </div>
          </Suspense>
        )}
      </main>
      <footer>
        <p>© 2026 EZ-WRT Project</p>
      </footer>
    </div>
  );
};

export default App;
