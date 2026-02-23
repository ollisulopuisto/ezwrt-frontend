import React, { useState } from 'react';
import { useStore } from '../store/useStore';

export const DeviceModule: React.FC = () => {
  const { devices, toggleDeviceInternet, setDeviceSchedule, firewallRules } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('21:00');
  const [stopTime, setStopTime] = useState('07:00');

  const isPaused = (mac: string) => {
    const section = `block_${mac.replace(/:/g, '')}`;
    return firewallRules && firewallRules[section] && firewallRules[section].target === 'REJECT' && firewallRules[section].enabled !== '0';
  };

  const getBedtime = (mac: string) => {
    const section = `bedtime_${mac.replace(/:/g, '')}`;
    return firewallRules?.[section] || null;
  };

  return (
    <div className="module devices">
      <h2>Connected Devices</h2>
      <div className="device-list">
        {devices.length === 0 && <p className="empty-state">No devices found.</p>}
        {devices.map((dev) => {
          const paused = isPaused(dev.mac);
          const bedtime = getBedtime(dev.mac);
          const activeBedtime = bedtime && bedtime.enabled !== '0';

          return (
            <div key={dev.mac} className={`device-card-wrapper`}>
              <div className={`device-card ${paused ? 'paused' : ''}`}>
                <div className="device-info" onClick={() => setExpanded(expanded === dev.mac ? null : dev.mac)}>
                  <span className="hostname">{dev.hostname || 'Unknown Device'}</span>
                  <span className="details">
                    {dev.ip} • {dev.mac}
                    {activeBedtime && <span className="bedtime-indicator"> 🌙 {bedtime.start_time}-{bedtime.stop_time}</span>}
                  </span>
                </div>
                <div className="device-actions">
                  <button 
                    className={`btn-pause ${paused ? 'btn-success' : 'btn-danger'}`}
                    onClick={() => toggleDeviceInternet(dev.mac, !paused)}
                  >
                    {paused ? '▶' : '⏸'}
                  </button>
                </div>
              </div>

              {expanded === dev.mac && (
                <div className="device-expanded">
                  <h3>🌙 Bedtime Schedule</h3>
                  <p>Automatically block internet daily between:</p>
                  <div className="schedule-form">
                    <div className="input-group">
                      <label>Starts</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Ends</label>
                      <input type="time" value={stopTime} onChange={e => setStopTime(e.target.value)} />
                    </div>
                    <button 
                      onClick={() => setDeviceSchedule(dev.mac, startTime, stopTime, !activeBedtime)}
                      className={`btn-small ${activeBedtime ? 'btn-danger' : 'btn-primary'}`}
                    >
                      {activeBedtime ? 'Disable Bedtime' : 'Enable Bedtime'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
