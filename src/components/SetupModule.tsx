import React, { useState } from 'react';
import { useStore } from '../store/useStore';

export const SetupModule: React.FC = () => {
  const { routerIp, setRouterIp, fetchData } = useStore();
  const [ip, setIp] = useState(routerIp);

  return (
    <div className="module setup">
      <h2>Router Connection</h2>
      <p>Configure the IP address of your OpenWrt router.</p>
      <div className="setup-form">
        <input 
          value={ip} 
          onChange={(e) => setIp(e.target.value)} 
          placeholder="e.g. 192.168.1.1" 
        />
        <div className="setup-hint">
          <small>Current: {routerIp}</small>
          <button className="btn-small" onClick={() => setIp('127.0.0.1:3001')}>Use Local Mock</button>
        </div>
        <button onClick={() => { setRouterIp(ip); fetchData(); }} className="btn-primary">
          Update & Connect
        </button>
      </div>
    </div>
  );
};
