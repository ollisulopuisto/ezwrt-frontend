const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;

// ubus status codes (see libubus). The mock returns real failures so that
// calls which would break on a router also break here.
const OK = 0;
const METHOD_NOT_FOUND = 3;
const NOT_FOUND = 4;
const PERMISSION_DENIED = 6;

const SESSION_ID = 'deadbeef1234';

let startTime = Date.now();

// Mirrors /etc/config/* on a router. uci.set only edits existing sections;
// creating one requires uci.add, exactly as rpcd behaves.
const configs = {
  wireless: {
    radio0: { '.type': 'wifi-device', channel: '11', band: '2g' },
    radio1: { '.type': 'wifi-device', channel: '36', band: '5g' },
    default_radio0: { '.type': 'wifi-iface', device: 'radio0', ssid: 'EZ-WRT 2.4GHz', key: 'password123', disabled: '0' },
    default_radio1: { '.type': 'wifi-iface', device: 'radio1', ssid: 'EZ-WRT 5GHz', key: 'password123', disabled: '0' },
    guest: { '.type': 'wifi-iface', device: 'radio0', ssid: 'EZ-Guest-WiFi', key: 'guestpass123', disabled: '1' }
  },
  adblock: {
    global: { '.type': 'adblock', adb_enabled: '1' }
  },
  network: {
    lan: { '.type': 'interface', proto: 'static', ipaddr: '192.168.1.1', device: 'br-lan' },
    wan: { '.type': 'interface', proto: 'dhcp', device: 'eth1' },
    wg0: { '.type': 'interface', proto: 'wireguard', disabled: '1' }
  },
  firewall: {
    redirect0: {
      '.type': 'redirect',
      name: 'HTTP Redirect',
      src: 'wan',
      src_dport: '80',
      dest: 'lan',
      dest_ip: '192.168.1.100',
      dest_port: '80',
      target: 'DNAT'
    }
  },
  dhcp: {}
};

// Services that reloaded since boot, so the UI can be checked against the
// "commit alone changes nothing" behaviour of a real router.
const reloaded = [];

const isVpnUp = () => configs.network.wg0.disabled === '0';
const isAdblockOn = () => configs.adblock.global.adb_enabled === '1';

let anonymousCounter = 0;

function uciGet(params) {
  const { config, section, option } = params;
  const pkg = configs[config];
  if (!pkg) return [NOT_FOUND, {}];

  if (section) {
    const sec = pkg[section];
    if (!sec) return [NOT_FOUND, {}];
    if (option) {
      return sec[option] === undefined ? [NOT_FOUND, {}] : [OK, { value: sec[option] }];
    }
    return [OK, { values: sec }];
  }
  return [OK, { values: pkg }];
}

function uciSet(params) {
  const { config, section, values } = params;
  const pkg = configs[config];
  if (!pkg) return [NOT_FOUND, {}];
  // The important part: setting options on a section that does not exist fails.
  if (!section || !pkg[section]) return [NOT_FOUND, {}];
  Object.assign(pkg[section], values || {});
  return [OK, {}];
}

function uciAdd(params) {
  const { config, type, name, values } = params;
  const pkg = configs[config];
  if (!pkg) return [NOT_FOUND, {}];
  if (!type) return [NOT_FOUND, {}];

  const section = name || `cfg${(++anonymousCounter).toString().padStart(6, '0')}`;
  pkg[section] = { '.type': type, ...(values || {}) };
  return [OK, { section }];
}

app.post('/ubus', (req, res) => {
  const { method, params = {}, id } = req.body || {};
  if (typeof method !== 'string') {
    return res.json({ jsonrpc: '2.0', id, result: [METHOD_NOT_FOUND, {}] });
  }

  const separator = method.lastIndexOf('.');
  const object = method.slice(0, separator);
  const action = method.slice(separator + 1);

  console.log(`[ubus] ${method}`, params);

  // Everything except the login itself requires a session, like rpcd.
  if (method !== 'session.login' && params.ubus_rpc_session !== SESSION_ID) {
    console.warn(`[ubus] ${method} rejected: missing or stale session`);
    return res.json({ jsonrpc: '2.0', id, result: [PERMISSION_DENIED, {}] });
  }

  let result = null;

  if (method === 'session.login') {
    result = [OK, { ubus_rpc_session: SESSION_ID, timeout: 300, expires: 300 }];
  } else if (object === 'uci') {
    if (action === 'get') result = uciGet(params);
    else if (action === 'set') result = uciSet(params);
    else if (action === 'add') result = uciAdd(params);
    else if (action === 'commit') result = configs[params.config] ? [OK, {}] : [NOT_FOUND, {}];
    else result = [METHOD_NOT_FOUND, {}];
  } else if (object === 'service' && action === 'event') {
    const pkg = params?.data?.package;
    console.log(`[ubus] reload triggered for ${pkg}`);
    reloaded.push({ package: pkg, at: Date.now() });
    result = [OK, {}];
  } else if (object === 'service' && action === 'list') {
    result = [OK, { adblock: { instances: { instance1: { running: isAdblockOn() } } } }];
  } else if (object === 'network.interface' && action === 'status') {
    if (params.interface === 'wg0') {
      result = [OK, {
        up: isVpnUp(),
        pending: false,
        available: true,
        device: 'wg0',
        l3_device: 'wg0',
        uptime: isVpnUp() ? 3600 : 0,
        'ipv4-address': isVpnUp() ? [{ address: '10.0.0.2', mask: 32 }] : []
      }];
    } else if (params.interface === 'wan') {
      result = [OK, { up: true, device: 'eth1', l3_device: 'eth1', uptime: uptimeSeconds() }];
    } else {
      result = [NOT_FOUND, {}];
    }
  } else if (object === 'network.interface' && (action === 'up' || action === 'down')) {
    result = [OK, {}];
  } else if (object === 'network.device' && action === 'status') {
    // Only the real WAN device reports stats, so a hardcoded guess fails here.
    if (params.name !== 'eth1') {
      result = [NOT_FOUND, {}];
    } else {
      const uptime = uptimeSeconds();
      result = [OK, {
        up: true,
        statistics: {
          rx_bytes: 1024 * 1024 * 50 + (uptime * 50000),
          tx_bytes: 1024 * 1024 * 10 + (uptime * 15000)
        }
      }];
    }
  } else if (object === 'system' && action === 'info') {
    result = [OK, {
      uptime: uptimeSeconds(),
      localtime: Math.floor(Date.now() / 1000),
      load: [0.12, 0.08, 0.05],
      memory: { total: 128 * 1024 * 1024, free: 64 * 1024 * 1024, shared: 0, buffered: 8 * 1024 * 1024 }
    }];
  } else if (object === 'system' && action === 'reboot') {
    startTime = Date.now(); // Simulate reboot by resetting start time
    result = [OK, {}];
  } else if (object === 'dhcp' && action === 'ipv4leases') {
    result = [OK, {
      device: {
        'eth1': {
          leases: [
            { ip: '192.168.1.121', mac: '00:11:22:33:44:55', hostname: 'Dads-iPhone' },
            { ip: '192.168.1.142', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'Moms-MacBook' },
            { ip: '192.168.1.189', mac: '11:22:33:44:55:66', hostname: 'Kids-PlayStation' }
          ]
        }
      }
    }];
  } else {
    console.warn(`[ubus] Unhandled method: ${method}`);
    result = [METHOD_NOT_FOUND, {}];
  }

  res.json({ jsonrpc: '2.0', id, result });
});

function uptimeSeconds() {
  return Math.floor((Date.now() - startTime) / 1000);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EZ-WRT Mock Server running on http://0.0.0.0:${PORT}`);
});
