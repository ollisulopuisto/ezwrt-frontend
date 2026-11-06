import React from 'react';
import { useStore } from '../store/useStore';

export const AdblockModule: React.FC = () => {
  // Performance optimization: Subscribe using granular selectors.
  // Calling useStore() with no arguments subscribes to every store update
  // (such as trafficHistory, uptime, and devices on each 15s poll).
  // Granular selectors prevent AdblockModule from re-rendering during periodic polls
  // when adblock status hasn't changed.
  const adblockEnabled = useStore((s) => s.adblockEnabled);
  const toggleAdblock = useStore((s) => s.toggleAdblock);
  const pendingApply = useStore((s) => s.pendingApply);

  return (
    <div className="module adblock">
      <h2>Adblock Settings</h2>
      <p>Integrated adblock for your network.</p>
      <div className={`status ${adblockEnabled ? 'on' : 'off'}`}>
        {adblockEnabled ? 'Adblock Active' : 'Adblock Disabled'}
      </div>
      <button onClick={toggleAdblock} disabled={!!pendingApply} className={`toggle ${adblockEnabled ? 'btn-danger' : 'btn-success'}`}>
        {adblockEnabled ? 'Disable Adblock' : 'Enable Adblock'}
      </button>
    </div>
  );
};
