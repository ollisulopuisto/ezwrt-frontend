import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Shown while a change is applied but unconfirmed. If the change cut the user's
 * connection they never see this — which is the point: the router rolls back on
 * its own when the timer runs out.
 */
export const ApplyBanner: React.FC = () => {
  const { pendingApply, confirmApply, revertApply, applyExpired } = useStore();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pendingApply) return;

    const tick = () => {
      const left = pendingApply.expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) applyExpired();
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [pendingApply, applyExpired]);

  if (!pendingApply) return null;

  const elapsed = pendingApply.timeout * 1000 - remaining;
  const progress = Math.min(100, Math.max(0, (elapsed / (pendingApply.timeout * 1000)) * 100));
  const urgent = remaining <= 20000;

  return (
    <div className={`apply-banner ${urgent ? 'urgent' : ''}`} role="alert">
      <div className="apply-banner-text">
        <strong>{pendingApply.summary}</strong>
        <span>
          Still connected? Confirm within <b>{formatRemaining(remaining)}</b> or the router
          restores the previous settings.
        </span>
      </div>
      <div className="apply-countdown" aria-hidden="true">
        <div className="apply-countdown-bar" style={{ width: `${100 - progress}%` }} />
      </div>
      <div className="apply-banner-actions">
        <button className="btn-primary btn-success" onClick={confirmApply}>
          Everything works — keep it
        </button>
        <button className="btn-small" onClick={revertApply}>
          Undo now
        </button>
      </div>
    </div>
  );
};
