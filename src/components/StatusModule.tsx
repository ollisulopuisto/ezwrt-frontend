import React from 'react';
import { useStore } from '../store/useStore';

export const StatusModule: React.FC = () => {
  const { uptime, trafficHistory, rebootRouter } = useStore();

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  const latest = trafficHistory[trafficHistory.length - 1] || { rx: 0, tx: 0 };

  // Micro-Chart SVG Logic
  const maxVal = Math.max(...trafficHistory.map(d => Math.max(d.rx, d.tx)), 10);
  const width = 300;
  const height = 100;

  const getPoints = (key: 'rx' | 'tx') => {
    return trafficHistory.map((d, i) => {
      const x = (i / Math.max(trafficHistory.length - 1, 1)) * width;
      const y = height - (d[key] / maxVal) * height;
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div className="module status-dashboard">
      <div className="module-header">
        <h2>System Status</h2>
        <button className="btn-icon" onClick={rebootRouter} title="Reboot Router">
          🔄
        </button>
      </div>
      <div className="status-grid">
        <div className="status-card">
          <div className="stat">
            <label>Uptime</label>
            <span>{formatUptime(uptime)}</span>
          </div>
        </div>
        <div className="status-card">
          <div className="stat">
            <label>Total RX</label>
            <span style={{color: '#007bff'}}>{latest.rx} MB</span>
          </div>
        </div>
        <div className="status-card">
          <div className="stat">
            <label>Total TX</label>
            <span style={{color: '#28a745'}}>{latest.tx} MB</span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3>Network Traffic (MB)</h3>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="120" preserveAspectRatio="none" style={{background: '#f8f9fa', borderRadius: '4px'}}>
          <polyline points={getPoints('rx')} fill="none" stroke="#007bff" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={getPoints('tx')} fill="none" stroke="#28a745" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
