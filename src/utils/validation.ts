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
 * Also validates optional rule name to prevent UCI config corruption,
 * control character injection, or excessively long section aliases.
 */
export const isValidPortForwardRule = (rule: PortForwardRuleInput): boolean => {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.name !== undefined && rule.name !== null) {
    if (typeof rule.name !== 'string') return false;
    if (/[\r\n\0]/.test(rule.name)) return false;
    if (rule.name.length > 32) return false;
  }
  return (
    isValidPort(rule.src_dport) &&
    isValidIpv4(rule.dest_ip) &&
    isValidPort(rule.dest_port)
  );
};

/**
 * Validates standard MAC address format (e.g., 00:11:22:33:44:55 or AA-BB-CC-DD-EE-FF).
 * Prevents injection or invalid characters into firewall rule options and section names.
 */
export const isValidMacAddress = (mac: string): boolean => {
  if (typeof mac !== 'string') return false;
  if (/[\r\n]/.test(mac)) return false;
  const trimmed = mac.trim();
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/.test(trimmed);
};

/**
 * Validates 24-hour time string in HH:MM format (00:00 to 23:59).
 * Used for fw4 firewall bedtime scheduling.
 */
export const isValidTimeString = (time: string): boolean => {
  if (typeof time !== 'string') return false;
  if (/[\r\n]/.test(time)) return false;
  const trimmed = time.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed);
};

/**
 * Validates router endpoint format (host or host:port).
 * Host can be a valid IPv4 address or domain/hostname (RFC 1123).
 * Prevents SSRF / malformed URL injection or unintended base URLs.
 */
export const isValidRouterEndpoint = (endpoint: string): boolean => {
  if (typeof endpoint !== 'string') return false;
  if (/[\r\n\s]/.test(endpoint)) return false;
  // Disallow scheme, credentials, path, query, or fragment characters
  if (/[/?#@\\]/.test(endpoint)) return false;

  const colonIdx = endpoint.lastIndexOf(':');
  let host = endpoint;
  if (colonIdx !== -1) {
    const portPart = endpoint.slice(colonIdx + 1);
    if (!isValidPort(portPart)) return false;
    host = endpoint.slice(0, colonIdx);
  }

  if (isValidIpv4(host)) return true;

  // RFC 1123 hostname validation: labels up to 63 chars of [a-zA-Z0-9-], not starting/ending with hyphen
  const hostnameRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-_]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-_]{1,63}(?<!-))*$/;
  return hostnameRegex.test(host);
};

/**
 * Validates WiFi SSID according to IEEE 802.11 standards.
 * SSID must be between 1 and 32 octets (bytes) in length, and not contain
 * newline/carriage return control characters or null bytes.
 */
export const isValidWifiSsid = (ssid: string): boolean => {
  if (typeof ssid !== 'string') return false;
  if (/[\r\n\0]/.test(ssid)) return false;
  const byteLength = new TextEncoder().encode(ssid).length;
  return byteLength >= 1 && byteLength <= 32;
};

/**
 * Validates WPA/WPA2/WPA3 pre-shared key (passphrase).
 * Must be either an ASCII passphrase of 8 to 63 printable characters (ASCII 32-126)
 * or a 64-character hexadecimal pre-shared key.
 * Prevents newline injection or malformed wireless configuration options.
 */
export const isValidWifiKey = (key: string): boolean => {
  if (typeof key !== 'string') return false;
  if (/[\r\n]/.test(key)) return false;
  // 64-character hexadecimal PSK
  if (/^[0-9a-fA-F]{64}$/.test(key)) return true;
  // 8 to 63 printable ASCII characters
  return /^[\x20-\x7E]{8,63}$/.test(key);
};
