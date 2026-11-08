import React from 'react';
import { useStore } from '../store/useStore';

export const VpnModule: React.FC = () => {
  // Performance optimization: Subscribe using granular selectors.
  // Calling useStore() with no arguments subscribes VpnModule to every store update
  // (such as trafficHistory, uptime, and devices on each 15s poll).
  // Granular selectors prevent VpnModule from re-rendering during periodic polls
  // when VPN status and apply state have not changed.
  const vpnStatus = useStore((s) => s.vpnStatus);
  const toggleVpn = useStore((s) => s.toggleVpn);
  const pendingApply = useStore((s) => s.pendingApply);

  if (!vpnStatus) return null;

  return (
    <div className="module vpn">
      <div className="module-header">
        <h2>Privacy (VPN)</h2>
        <div className={`status-pill ${vpnStatus.up ? 'active' : 'inactive'}`}>
          {vpnStatus.up ? 'PROTECTED' : 'UNPROTECTED'}
        </div>
      </div>
      <p className="description">Encrypt your entire home network with WireGuard.</p>
      
      {vpnStatus.up && (
        <div className="vpn-details">
          <div className="info-row">
            <label>VPN IP:</label>
            <span>{vpnStatus.ip}</span>
          </div>
          <div className="info-row">
            <label>Connection Time:</label>
            <span>{Math.floor(vpnStatus.uptime / 60)} minutes</span>
          </div>
        </div>
      )}

      <button 
        onClick={toggleVpn} 
        disabled={!!pendingApply}
        className={`btn-primary ${vpnStatus.up ? 'btn-danger' : 'btn-success'}`}
      >
        {vpnStatus.up ? 'Disconnect VPN' : 'Connect VPN'}
      </button>
    </div>
  );
};
