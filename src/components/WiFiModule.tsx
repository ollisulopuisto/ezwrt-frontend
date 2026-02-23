import React, { useState } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store/useStore';

export const WiFiModule: React.FC = () => {
  const { wifiConfig, updateWifi } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [ssid, setSsid] = useState('');
  const [key, setKey] = useState('');

  if (!wifiConfig) return <div>Loading WiFi...</div>;

  const sections = Object.entries(wifiConfig).filter(([_, conf]) => conf.ssid);

  const generateQRCode = (data: string) => {
    const qr = qrcode(0, 'L');
    qr.addData(data);
    qr.make();
    return qr.createDataURL(4);
  };

  return (
    <div className="module wifi">
      <h2>WiFi Settings</h2>
      {sections.map(([id, conf]) => (
        <div key={id} className="wifi-section">
          <h3>{id.includes('radio0') ? '2.4GHz' : '5GHz'}</h3>
          {editing === id ? (
            <div className="wifi-form">
              <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="SSID" />
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Password" />
              <button onClick={() => { updateWifi(id, ssid, key); setEditing(null); }}>Save</button>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <div className="wifi-info">
              <p><strong>SSID:</strong> {conf.ssid}</p>
              <div className="qr-container">
                <img src={generateQRCode(`WIFI:S:${conf.ssid};T:WPA;P:${conf.key};;`)} alt="WiFi QR" width="128" />
                <p>Scan to Join</p>
              </div>
              <button onClick={() => { setEditing(id); setSsid(conf.ssid); setKey(conf.key); }}>Edit</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
