import React, { useEffect, Suspense, lazy } from 'react';
import { useStore } from './store/useStore';
import { AdblockModule } from './components/AdblockModule';
import { SetupModule } from './components/SetupModule';
import { FirewallModule } from './components/FirewallModule';
import { GuestWifiModule } from './components/GuestWifiModule';

// Heavy modules lazy loaded
const WiFiModule = lazy(() => import('./components/WiFiModule').then(m => ({ default: m.WiFiModule })));
const StatusModule = lazy(() => import('./components/StatusModule').then(m => ({ default: m.StatusModule })));

import './styles/main.css';
import './styles/firewall.css';
import './styles/guest.css';

const App: React.FC = () => {
  const { fetchData, loading, error } = useStore();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <header>
        <h1>EZ-WRT</h1>
        <p className="subtitle">Simple Router Management</p>
      </header>
      <main>
        <SetupModule />
        {loading && !useStore.getState().wifiConfig && <div className="loading">Connecting to Router...</div>}
        {error && <div className="error">Error connecting to {useStore.getState().routerIp}: {error}</div>}
        {(!loading || useStore.getState().wifiConfig) && !error && (
          <Suspense fallback={<div className="loading">Loading Module...</div>}>
            <StatusModule />
            <WiFiModule />
            <AdblockModule />
            <GuestWifiModule />
            <FirewallModule />
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
