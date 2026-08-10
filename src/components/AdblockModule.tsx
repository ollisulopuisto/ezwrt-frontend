import React from 'react';
import { useStore } from '../store/useStore';

export const AdblockModule: React.FC = () => {
  const { adblockEnabled, toggleAdblock, pendingApply } = useStore();

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
