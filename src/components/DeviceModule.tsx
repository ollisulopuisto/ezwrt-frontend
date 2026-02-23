import React from 'react';
import { useStore } from '../store/useStore';

export const DeviceModule: React.FC = () => {
  const { devices, toggleDeviceInternet, firewallRules } = useStore();

  const isPaused = (mac: string) => {
    const section = `block_${mac.replace(/:/g, '')}`;
    return firewallRules && firewallRules[section] && firewallRules[section].target === 'REJECT' && firewallRules[section].enabled !== '0';
  };

  return (
    <div className="module devices">
      <h2>Connected Devices</h2>
      <div className="device-list">
        {devices.length === 0 && <p className="empty-state">No devices found.</p>}
        {devices.map((dev) => {
          const paused = isPaused(dev.mac);
          return (
            <div key={dev.mac} className={`device-card ${paused ? 'paused' : ''}`}>
              <div className="device-info">
                <span className="hostname">{dev.hostname || 'Unknown Device'}</span>
                <span className="details">{dev.ip} • {dev.mac}</span>
              </div>
              <button 
                className={`btn-pause ${paused ? 'btn-success' : 'btn-danger'}`}
                onClick={() => toggleDeviceInternet(dev.mac, !paused)}
              >
                {paused ? '▶ Resume' : '⏸ Pause'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
