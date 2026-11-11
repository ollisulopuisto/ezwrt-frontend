import React from 'react';
import { useStore } from '../store/useStore';

export const GuestWifiModule: React.FC = () => {
  // Performance optimization: Subscribe using granular selectors.
  // Calling useStore() with no arguments subscribes GuestWifiModule to every store update
  // (such as trafficHistory, uptime, and devices on each 15s poll).
  // Granular selectors ensure GuestWifiModule only re-renders when guest WiFi status,
  // wireless config, guest section, or pending apply state change.
  const guestWifiEnabled = useStore((s) => s.guestWifiEnabled);
  const toggleGuestWifi = useStore((s) => s.toggleGuestWifi);
  const wifiConfig = useStore((s) => s.wifiConfig);
  const guestWifiSection = useStore((s) => s.guestWifiSection);
  const pendingApply = useStore((s) => s.pendingApply);

  const guest = guestWifiSection ? wifiConfig?.[guestWifiSection] : null;

  if (!guest) return null;

  return (
    <div className="module guest-wifi">
      <div className="module-header">
        <h2>Guest WiFi</h2>
        <div className={`status-pill ${guestWifiEnabled ? 'active' : 'inactive'}`}>
          {guestWifiEnabled ? 'ON' : 'OFF'}
        </div>
      </div>
      <p className="description">Provide internet access to visitors without sharing your main password.</p>
      
      <div className="guest-info">
        <div className="info-row">
          <label>Network Name:</label>
          <span>{guest.ssid}</span>
        </div>
        <div className="info-row">
          <label>Password:</label>
          <span>{guest.key}</span>
        </div>
      </div>

      <button 
        onClick={toggleGuestWifi} 
        disabled={!!pendingApply}
        className={`btn-primary ${guestWifiEnabled ? 'btn-danger' : 'btn-success'}`}
      >
        {guestWifiEnabled ? 'Turn Off Guest WiFi' : 'Turn On Guest WiFi'}
      </button>
    </div>
  );
};
