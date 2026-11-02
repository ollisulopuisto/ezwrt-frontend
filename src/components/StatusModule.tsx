import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';

const CHART_WIDTH = 300;
const CHART_HEIGHT = 100;

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

  // Performance optimization: Memoize SVG polyline points computation for rx and tx.
  // When StatusModule re-renders due to parent renders or state changes unrelated to
  // trafficHistory, memoizing avoids repeated Math.max array reductions, coordinate calculations,
  // and string concatenations.
  const { rxPoints, txPoints } = useMemo(() => {
    const maxVal = Math.max(...trafficHistory.map(d => Math.max(d.rx, d.tx)), 10);
    const divisor = Math.max(trafficHistory.length - 1, 1);

    const computePoints = (key: 'rx' | 'tx') =>
      trafficHistory.map((d, i) => {
        const x = (i / divisor) * CHART_WIDTH;
        const y = CHART_HEIGHT - (d[key] / maxVal) * CHART_HEIGHT;
        return `${x},${y}`;
      }).join(' ');

    return {
      rxPoints: computePoints('rx'),
      txPoints: computePoints('tx'),
    };
  }, [trafficHistory]);

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
            <span className="stat-rx">{latest.rx} MB</span>
          </div>
        </div>
        <div className="status-card">
          <div className="stat">
            <label>Total TX</label>
            <span className="stat-tx">{latest.tx} MB</span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3>Network Traffic (MB)</h3>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} width="100%" height="120" preserveAspectRatio="none" className="traffic-chart">
          <polyline points={rxPoints} fill="none" className="traffic-line-rx" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={txPoints} fill="none" className="traffic-line-tx" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
