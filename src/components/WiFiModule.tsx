import React, { useState, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store/useStore';

export const WiFiModule: React.FC = () => {
  const { wifiConfig, updateWifi, guestWifiSection, pendingApply } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [ssid, setSsid] = useState('');
  const [key, setKey] = useState('');

  // Performance optimization: QR code generation involves Reed-Solomon error correction
  // and base64 data URL rendering (~8-10ms per QR code). Without memoization, every re-render
  // of WiFiModule (e.g. typing in SSID/password inputs, 15s poll updates) recalculated
  // synchronous QR codes on the main thread for all Wi-Fi sections.
  const qrCodes = useMemo(() => {
    if (!wifiConfig) return {};
    const map: Record<string, string> = {};
    Object.entries(wifiConfig).forEach(([id, conf]) => {
      if (!conf?.ssid) return;
      const qr = qrcode(0, 'L');
      qr.addData(`WIFI:S:${conf.ssid};T:WPA;P:${conf.key};;`);
      qr.make();
      map[id] = qr.createDataURL(4);
    });
    return map;
  }, [wifiConfig]);

  if (!wifiConfig) return <div>Loading WiFi...</div>;

  const sections = Object.entries(wifiConfig).filter(([, conf]) => conf.ssid);

  // Section names are arbitrary (default_radio0, wifinet1, ...); the band comes
  // from the radio the interface is attached to.
  const bandLabel = (id: string, device?: string) => {
    const radio = device || id;
    const band = radio.includes('radio0') ? '2.4GHz' : radio.includes('radio1') ? '5GHz' : 'Wireless';
    return id === guestWifiSection ? `${band} (Guest)` : band;
  };

  return (
    <div className="module wifi">
      <h2>WiFi Settings</h2>
      {sections.map(([id, conf]) => (
        <div key={id} className="wifi-section">
          <h3>{bandLabel(id, conf.device)}</h3>
          {editing === id ? (
            <div className="wifi-form">
              <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="SSID" />
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Password" />
              <button onClick={() => { updateWifi(id, ssid, key); setEditing(null); }} disabled={!!pendingApply}>Save</button>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <div className="wifi-info">
              <p><strong>SSID:</strong> {conf.ssid}</p>
              <div className="qr-container">
                {qrCodes[id] && <img src={qrCodes[id]} alt="WiFi QR" width="128" />}
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
