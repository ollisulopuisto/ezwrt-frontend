import React, { useEffect, Suspense, lazy } from 'react';
import { useStore } from './store/useStore';
import { AdblockModule } from './components/AdblockModule';
import { SetupModule } from './components/SetupModule';
import { FirewallModule } from './components/FirewallModule';
import { GuestWifiModule } from './components/GuestWifiModule';
import { DeviceModule } from './components/DeviceModule';
import { VpnModule } from './components/VpnModule';

// Heavy modules lazy loaded
const WiFiModule = lazy(() => import('./components/WiFiModule').then(m => ({ default: m.WiFiModule })));
const StatusModule = lazy(() => import('./components/StatusModule').then(m => ({ default: m.StatusModule })));

import './styles/main.css';
import './styles/firewall.css';
import './styles/guest.css';
import './styles/devices.css';
import './styles/vpn.css';

const App: React.FC = () => {
  const { fetchData, loading, error, theme, setTheme } = useStore();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, []);

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
        <SetupModule />
        {loading && !useStore.getState().wifiConfig && <div className="loading">Connecting to Router...</div>}
        {error && <div className="error">Error connecting to {useStore.getState().routerIp}: {error}</div>}
        {(!loading || useStore.getState().wifiConfig) && !error && (
          <Suspense fallback={<div className="loading">Loading Module...</div>}>
            <div className="left-column">
              <StatusModule />
              <VpnModule />
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
