import React from 'react';
import { useStore } from '../store/useStore';

export const GuestWifiModule: React.FC = () => {
  const { guestWifiEnabled, toggleGuestWifi, wifiConfig, guestWifiSection } = useStore();

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
        className={`btn-primary ${guestWifiEnabled ? 'btn-danger' : 'btn-success'}`}
      >
        {guestWifiEnabled ? 'Turn Off Guest WiFi' : 'Turn On Guest WiFi'}
      </button>
    </div>
  );
};
