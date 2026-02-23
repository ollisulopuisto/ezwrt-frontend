import React, { useState } from 'react';
import { Shield, Plus, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export const FirewallModule: React.FC = () => {
  const { firewallRules, addFirewallRule } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', src_dport: '', dest_ip: '', dest_port: '' });

  if (!firewallRules) return null;

  const redirects = Object.entries(firewallRules)
    .filter(([_, rule]: any) => rule.dest_ip);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addFirewallRule({
      ...newRule,
      src: 'wan',
      dest: 'lan',
      proto: 'tcp',
      target: 'DNAT'
    });
    setShowAdd(false);
    setNewRule({ name: '', src_dport: '', dest_ip: '', dest_port: '' });
  };

  return (
    <div className="module firewall">
      <div className="module-header">
        <h2>Port Forwarding</h2>
        <button className="btn-icon" onClick={() => setShowAdd(!showAdd)}>
          <Shield size={18} />
        </button>
      </div>

      <div className="forwarding-list">
        {redirects.length === 0 && <p className="empty-state">No active redirects.</p>}
        {redirects.map(([id, rule]: any) => (
          <div key={id} className="rule-card">
            <div className="rule-info">
              <strong>{rule.name || 'Unnamed Rule'}</strong>
              <small>WAN:{rule.src_dport} → {rule.dest_ip}:{rule.dest_port}</small>
            </div>
            <div className={`status-dot ${rule.target === 'DNAT' ? 'active' : ''}`} />
          </div>
        ))}
      </div>

      {showAdd && (
        <form className="add-rule-form" onSubmit={handleSubmit}>
          <h3>New Port Forward</h3>
          <input 
            placeholder="Rule Name (e.g. NAS)" 
            value={newRule.name} 
            onChange={e => setNewRule({...newRule, name: e.target.value})} 
            required 
          />
          <input 
            placeholder="External Port (e.g. 8080)" 
            value={newRule.src_dport} 
            onChange={e => setNewRule({...newRule, src_dport: e.target.value})} 
            required 
          />
          <input 
            placeholder="Internal IP (e.g. 192.168.1.100)" 
            value={newRule.dest_ip} 
            onChange={e => setNewRule({...newRule, dest_ip: e.target.value})} 
            required 
          />
          <input 
            placeholder="Internal Port (e.g. 80)" 
            value={newRule.dest_port} 
            onChange={e => setNewRule({...newRule, dest_port: e.target.value})} 
            required 
          />
          <div className="form-actions">
            <button type="submit" className="btn-primary">Add Rule</button>
            <button type="button" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
};
