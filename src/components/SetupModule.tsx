import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

export const SetupModule: React.FC = () => {
  const { 
    routerIp, 
    routerUser, 
    routerPass, 
    setRouterIp, 
    fetchData, 
    saveSettingsBackup, 
    restoreSettingsBackup, 
    settingsBackupAt,
    settingsMessage,
    clearSettingsMessage
  } = useStore();
  const [ip, setIp] = useState(routerIp);
  const [user, setUser] = useState(routerUser);
  const [pass, setPass] = useState(routerPass);

  useEffect(() => {
    if (!settingsMessage) return;
    const timer = setTimeout(() => clearSettingsMessage(), 2500);
    return () => clearTimeout(timer);
  }, [settingsMessage, clearSettingsMessage]);

  return (
    <div className="module setup">
      <h2>Router Connection</h2>
      <p>Configure the connection to your OpenWrt router.</p>
      <div className="setup-form">
        <input 
          value={ip} 
          onChange={(e) => setIp(e.target.value)} 
          placeholder="Router IP (e.g. 192.168.1.1)" 
        />
        <input 
          value={user} 
          onChange={(e) => setUser(e.target.value)} 
          placeholder="Username (e.g. root)" 
        />
        <input 
          type="password"
          value={pass} 
          onChange={(e) => setPass(e.target.value)} 
          placeholder="Admin Password" 
        />
        <div className="setup-hint">
          <small>Current: {routerIp}</small>
          <button className="btn-small" onClick={() => { setIp('127.0.0.1:3001'); setUser('root'); setPass('admin'); }}>Use Local Mock</button>
        </div>
        <button onClick={() => { setRouterIp(ip, user, pass); fetchData(); }} className="btn-primary">
          Update & Connect
        </button>
        <div className="setup-backup-actions">
          <button onClick={saveSettingsBackup} className="btn-small">Save Settings Snapshot</button>
          <button onClick={restoreSettingsBackup} className="btn-small">Restore Saved Snapshot</button>
        </div>
        {settingsBackupAt && (
          <div className="setup-hint">
            <small>Saved: {new Date(settingsBackupAt).toLocaleString()}</small>
          </div>
        )}
        {settingsMessage && (
          <div className="setup-message">
            <small>{settingsMessage}</small>
          </div>
        )}
      </div>
    </div>
  );
};
