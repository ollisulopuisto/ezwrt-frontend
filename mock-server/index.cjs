const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// Handle CORS pre-flight
// app.options('/*', cors());

let wifiConfig = {
  'radio0': {
    ssid: 'EZ-WRT 2.4GHz',
    key: 'password123',
    disabled: 0
  },
  'radio1': {
    ssid: 'EZ-WRT 5GHz',
    key: 'password123',
    disabled: 0
  },
  'guest': {
    ssid: 'EZ-Guest-WiFi',
    key: 'guestpass123',
    disabled: 1
  }
};

let adblockEnabled = true;
let vpnEnabled = false;
let startTime = Date.now();

app.post('/ubus', (req, res) => {
  const { method, params, id } = req.body;
  const [object, action] = method.split('.');

  console.log(`[ubus] ${method}`, params);

  let result = null;

  if (object === 'session' && action === 'login') {
    result = [0, { ubus_rpc_session: 'deadbeef1234' }];
  } else if (object === 'network.interface' && action === 'status') {
    if (params.interface === 'wg0') {
      result = [0, {
        up: vpnEnabled,
        pending: false,
        available: true,
        uptime: vpnEnabled ? 3600 : 0,
        'ipv4-address': vpnEnabled ? [{ address: '10.0.0.2', mask: 32 }] : []
      }];
    }
  } else if (object === 'system' && action === 'info') {
    result = [0, {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      localtime: Math.floor(Date.now() / 1000),
      load: [0.12, 0.08, 0.05],
      memory: { total: 128 * 1024 * 1024, free: 64 * 1024 * 1024, shared: 0, buffered: 8 * 1024 * 1024 }
    }];
  } else if (object === 'network.device' && action === 'status') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    result = [0, {
      statistics: {
        rx_bytes: 1024 * 1024 * 50 + (uptime * 50000),
        tx_bytes: 1024 * 1024 * 10 + (uptime * 15000)
      }
    }];
  } else if (object === 'dhcp' && action === 'ipv4leases') {
    result = [0, {
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
  } else if (object === 'system' && action === 'reboot') {
    startTime = Date.now(); // Simulate reboot by resetting start time
    result = [0, {}];
  } else if (object === 'uci') {
    if (action === 'get') {
      const { config, section, option } = params;
      if (config === 'wireless') {
        result = [0, { values: wifiConfig }];
      } else if (config === 'adblock') {
        result = [0, { values: { 'default': { enabled: adblockEnabled ? '1' : '0' } } }];
      } else if (config === 'network') {
        if (section === 'wg0') {
          result = [0, { values: { disabled: vpnEnabled ? '0' : '1' } }];
        } else {
          result = [0, { values: { 'wg0': { disabled: vpnEnabled ? '0' : '1' } } }];
        }
      } else if (config === 'firewall') {
        result = [0, { values: { 'redirect0': { name: 'HTTP Redirect', src: 'wan', src_dport: '80', dest: 'lan', dest_ip: '192.168.1.100', dest_port: '80', target: 'DNAT' } } }];
      }
    } else if (action === 'set') {
      const { config, section, values } = params;
      if (config === 'wireless') {
        wifiConfig[section] = { ...wifiConfig[section], ...values };
        result = [0, {}];
      } else if (config === 'network' && section === 'wg0') {
        vpnEnabled = values.disabled === '0';
        result = [0, {}];
      } else if (config === 'adblock') {
        adblockEnabled = values.enabled === '1';
        result = [0, {}];
      }
    } else if (action === 'commit') {
      result = [0, {}];
    }
  } else if (object === 'service' && action === 'list') {
    result = [0, { 'adblock': { 'instances': { 'default': { 'running': adblockEnabled } } } }];
  }

  if (result) {
    res.json({ jsonrpc: '2.0', id, result });
  } else {
    // Return a default success instead of 404 to prevent UI crashes for unimplemented mock calls
    console.warn(`[ubus] Unhandled method: ${method}. Returning empty success.`);
    res.json({ jsonrpc: '2.0', id, result: [0, {}] });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EZ-WRT Mock Server running on http://0.0.0.0:${PORT}`);
});
