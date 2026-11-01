/**
 * Input validation utilities for router configurations.
 * Validating network parameters before sending them to rpcd / UCI prevents
 * malformed firewall rules, network configuration corruption, and parameter injection.
 */

/**
 * Validates standard IPv4 dotted-decimal address (0.0.0.0 to 255.255.255.255).
 * Prevents invalid or malformed IP addresses in router firewall redirection.
 */
export const isValidIpv4 = (ip: string): boolean => {
  if (typeof ip !== 'string') return false;
  // Strictly disallow newline or return characters
  if (/[\r\n]/.test(ip)) return false;
  const trimmed = ip.trim();
  if (/\s/.test(trimmed)) return false;
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false; // Prevent octal confusion
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
};

/**
 * Validates network port numbers (1-65535).
 * Supports numbers or string representations of numbers.
 */
export const isValidPort = (port: string | number): boolean => {
  if (typeof port === 'number') {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }
  if (typeof port !== 'string') return false;
  const trimmed = port.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const num = Number(trimmed);
  return num >= 1 && num <= 65535;
};

/**
 * Port forward redirect configuration shape.
 */
export interface PortForwardRuleInput {
  name?: string;
  src_dport: string | number;
  dest_ip: string;
  dest_port: string | number;
  [key: string]: unknown;
}

/**
 * Validates required parameters for a DNAT port forwarding rule.
 */
export const isValidPortForwardRule = (rule: PortForwardRuleInput): boolean => {
  if (!rule || typeof rule !== 'object') return false;
  return (
    isValidPort(rule.src_dport) &&
    isValidIpv4(rule.dest_ip) &&
    isValidPort(rule.dest_port)
  );
};
