import React, { useState } from 'react';
import { useStore } from '../store/useStore';

export const SetupModule: React.FC = () => {
  const { routerIp, routerPass, setRouterIp, fetchData } = useStore();
  const [ip, setIp] = useState(routerIp);
  const [pass, setPass] = useState(routerPass);

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
          type="password"
          value={pass} 
          onChange={(e) => setPass(e.target.value)} 
          placeholder="Admin Password" 
        />
        <div className="setup-hint">
          <small>Current: {routerIp}</small>
          <button className="btn-small" onClick={() => { setIp('127.0.0.1:3001'); setPass('admin'); }}>Use Local Mock</button>
        </div>
        <button onClick={() => { setRouterIp(ip, pass); fetchData(); }} className="btn-primary">
          Update & Connect
        </button>
      </div>
    </div>
  );
};
