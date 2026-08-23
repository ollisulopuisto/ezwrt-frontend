import React from 'react';
import { useStore } from '../store/useStore';

/**
 * Software flow offloading is off by default on OpenWrt, and on modest hardware
 * that ceiling is easy to mistake for the ISP's: a router that caps a 250/25
 * line at 200 Mbit/s looks exactly like a 200 Mbit/s plan. This surfaces the
 * setting instead of flipping it during install, so the change is visible,
 * explained, and covered by the same rollback timer as everything else.
 */
export const PerformanceModule: React.FC = () => {
  const { flowOffloading, sqmActive, setFlowOffloading, pendingApply } = useStore();

  // Nothing readable to act on — no firewall defaults section, or the config
  // could not be fetched at all.
  if (flowOffloading === null) return null;

  const blockedBySqm = !flowOffloading && sqmActive === true;
  const sqmUnknown = !flowOffloading && sqmActive === null;

  return (
    <div className="module performance">
      <div className="module-header">
        <h2>Fast Forwarding</h2>
        <div className={`status-pill ${flowOffloading ? 'active' : 'inactive'}`}>
          {flowOffloading ? 'ON' : 'OFF'}
        </div>
      </div>

      {flowOffloading ? (
        <>
          <p className="description">
            Your router is passing traffic the quick way, which lets it reach higher
            speeds without working as hard.
          </p>
          <p className="description">
            One trade-off: because this traffic skips the counting step, per-device
            usage totals will read low while it is on.
          </p>
          <button
            onClick={() => setFlowOffloading(false)}
            disabled={!!pendingApply}
            className="btn-primary btn-danger"
          >
            Turn Off Fast Forwarding
          </button>
        </>
      ) : (
        <>
          <p className="description">
            Your router is forwarding traffic the slow way. Switching this on lets it
            handle more speed with less effort — on a comparable router this measured
            about a quarter more throughput while using less processing power. If your
            connection has always felt capped below what you pay for, this is the
            first thing worth trying.
          </p>

          {blockedBySqm && (
            <p className="description">
              <strong>Not recommended on this router.</strong> You have SQM traffic
              shaping switched on, which keeps video calls and gaming smooth while
              something else is downloading. Fast forwarding skips that shaping, so
              you would gain speed and lose smoothness. Leaving it off is the better
              trade here.
            </p>
          )}

          {sqmUnknown && (
            <p className="description">
              One thing to know: if you have set up SQM traffic shaping for
              bufferbloat, this bypasses it. We could not check from here, so if that
              means nothing to you, you almost certainly do not have it.
            </p>
          )}

          <button
            onClick={() => setFlowOffloading(true)}
            disabled={!!pendingApply || blockedBySqm}
            className="btn-primary btn-success"
          >
            {blockedBySqm ? 'Not Available (SQM Is On)' : 'Turn On Fast Forwarding'}
          </button>
        </>
      )}
    </div>
  );
};
