import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, Download, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';

export const StatusModule: React.FC = () => {
  const { uptime, trafficHistory } = useStore();

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  const latest = trafficHistory[trafficHistory.length - 1] || { rx: 0, tx: 0 };

  return (
    <div className="module status-dashboard">
      <h2>System Status</h2>
      <div className="status-grid">
        <div className="status-card">
          <Clock size={20} />
          <div className="stat">
            <label>Uptime</label>
            <span>{formatUptime(uptime)}</span>
          </div>
        </div>
        <div className="status-card">
          <Download size={20} color="#007bff" />
          <div className="stat">
            <label>Total RX</label>
            <span>{latest.rx} MB</span>
          </div>
        </div>
        <div className="status-card">
          <Upload size={20} color="#28a745" />
          <div className="stat">
            <label>Total TX</label>
            <span>{latest.tx} MB</span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3>Network Traffic (MB)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trafficHistory}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="rx" stroke="#007bff" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="tx" stroke="#28a745" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
