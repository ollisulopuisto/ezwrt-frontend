import React, { useEffect } from 'react';
import { useStore } from './store/useStore';
import { WiFiModule } from './components/WiFiModule';
import { AdblockModule } from './components/AdblockModule';
import { SetupModule } from './components/SetupModule';
import { StatusModule } from './components/StatusModule';
import './App.css';

const App: React.FC = () => {
  const { fetchData, loading, error } = useStore();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds for traffic stats
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
          <>
            <StatusModule />
            <WiFiModule />
            <AdblockModule />
          </>
        )}
      </main>
      <footer>
        <p>© 2026 EZ-WRT Project</p>
      </footer>
    </div>
  );
};

export default App;
