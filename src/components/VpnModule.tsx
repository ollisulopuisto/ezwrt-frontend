import React from 'react';
import { useStore } from '../store/useStore';

export const VpnModule: React.FC = () => {
  const { vpnStatus, toggleVpn, pendingApply } = useStore();

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
