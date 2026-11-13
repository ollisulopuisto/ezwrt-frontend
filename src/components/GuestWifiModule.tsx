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
  // Select the guest fields themselves as primitives. Every 15s poll replaces
  // wifiConfig with a freshly parsed object, so selecting the object would
  // re-render on every poll even when nothing about the guest network changed.
  const guestSsid = useStore((s) =>
    s.guestWifiSection ? s.wifiConfig?.[s.guestWifiSection]?.ssid : undefined
  );
  const guestKey = useStore((s) =>
    s.guestWifiSection ? s.wifiConfig?.[s.guestWifiSection]?.key : undefined
  );
  const hasGuest = useStore((s) =>
    s.guestWifiSection ? !!s.wifiConfig?.[s.guestWifiSection] : false
  );
  const pendingApply = useStore((s) => s.pendingApply);

  if (!hasGuest) return null;

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
          <span>{guestSsid}</span>
        </div>
        <div className="info-row">
          <label>Password:</label>
          <span>{guestKey}</span>
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
