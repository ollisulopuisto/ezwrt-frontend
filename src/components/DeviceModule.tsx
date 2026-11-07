import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';

interface FirewallRule {
  target?: string;
  enabled?: string | number | boolean;
  start_time?: string;
  stop_time?: string;
  [key: string]: unknown;
}

export const DeviceModule: React.FC = () => {
  // Performance optimization: Subscribe using granular selectors.
  // Calling useStore() with no arguments subscribes DeviceModule to every store update
  // (such as trafficHistory and uptime on each 15s poll).
  // Granular selectors ensure DeviceModule only re-renders when connected devices,
  // firewall rules, or apply state change.
  const devices = useStore((s) => s.devices);
  const toggleDeviceInternet = useStore((s) => s.toggleDeviceInternet);
  const setDeviceSchedule = useStore((s) => s.setDeviceSchedule);
  const firewallRules = useStore((s) => s.firewallRules);
  const pendingApply = useStore((s) => s.pendingApply);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('21:00');
  const [stopTime, setStopTime] = useState('07:00');

  // Performance optimization: Pre-index paused devices and active bedtime schedules
  // into Maps/Sets keyed by firewallRules.
  // When DeviceModule re-renders (e.g. while editing schedule time inputs or during periodic
  // polling), this avoids repeated string regex replacements (`mac.replace(/:/g, '')`) and
  // section key lookups for every device on every render.
  const { pausedSet, bedtimeMap } = useMemo(() => {
    const paused = new Set<string>();
    const bedtime = new Map<string, FirewallRule>();

    if (firewallRules) {
      Object.entries(firewallRules as Record<string, FirewallRule>).forEach(([section, rule]) => {
        if (!rule) return;
        if (section.startsWith('block_') && rule.target === 'REJECT' && rule.enabled !== '0') {
          const cleanMac = section.slice(6);
          paused.add(cleanMac);
        } else if (section.startsWith('bedtime_')) {
          const cleanMac = section.slice(8);
          bedtime.set(cleanMac, rule);
        }
      });
    }

    return { pausedSet: paused, bedtimeMap: bedtime };
  }, [firewallRules]);

  return (
    <div className="module devices">
      <h2>Connected Devices</h2>
      <div className="device-list">
        {devices.length === 0 && <p className="empty-state">No devices found.</p>}
        {devices.map((dev) => {
          const cleanMac = dev.mac ? dev.mac.replace(/:/g, '') : '';
          const paused = pausedSet.has(cleanMac);
          const bedtime = bedtimeMap.get(cleanMac) || null;
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
                    disabled={!!pendingApply}
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
                      disabled={!!pendingApply}
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
