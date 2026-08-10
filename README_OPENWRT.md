# EZ-WRT OpenWrt Integration

To use the EZ-WRT frontend with your OpenWrt 25 device, you need to configure `rpcd` and `uhttpd`.

## Quick Install (Recommended)

Connect to your router via SSH and run this single command:

```bash
wget -qO- https://raw.githubusercontent.com/ollisulopuisto/ezwrt-frontend/main/scripts/openwrt-install.sh | sh
```

This will automatically install the required packages, configure RPCD permissions, and restart services.

---

## Manual Setup

### 1. Install Dependencies
Ensure you have the ubus HTTP bridge installed:
```bash
apk update
apk add uhttpd uhttpd-mod-ubus rpcd
```

### 2. Configure ACL (Access Control List)
Create a new ACL file at `/usr/share/rpcd/acl.d/ezwrt.json` to grant the frontend permission to manage the router:

```json
{
  "ezwrt": {
    "description": "EZ-WRT Access",
    "read": {
      "uci": [ "wireless", "adblock", "network", "firewall", "dhcp" ],
      "ubus": {
        "session": [ "access" ],
        "service": [ "list" ],
        "network.interface": [ "status" ],
        "network.device": [ "status" ],
        "system": [ "info" ],
        "dhcp": [ "ipv4leases" ]
      }
    },
    "write": {
      "uci": [ "wireless", "adblock", "network", "firewall" ],
      "ubus": {
        "service": [ "event" ],
        "network.interface": [ "up", "down" ],
        "system": [ "reboot" ]
      }
    }
  }
}
```

### 3. Enable the ubus HTTP bridge
`ubus_cors` is required when the app is not served by the router itself (phone
app or dev machine); browsers block cross-origin ubus calls otherwise.
```bash
uci set uhttpd.main.ubus_prefix='/ubus'
uci set uhttpd.main.ubus_cors='1'
uci commit uhttpd
```

### 4. Restart Services
```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

### 5. Install the frontend (optional)
The steps above prepare the router; they do not install the app. To serve it
from the router, build it on your workstation and copy it over:
```bash
npm run build
ssh root@<YOUR_ROUTER_IP> 'mkdir -p /www/ezwrt'
scp -r dist/* root@<YOUR_ROUTER_IP>:/www/ezwrt/
```
The quick installer does this for you if you point it at a tarball of `dist/`:
```bash
EZWRT_DIST_URL=https://example.com/ezwrt-dist.tar.gz sh openwrt-install.sh
```

### 6. Connection
Open `http://<YOUR_ROUTER_IP>/ezwrt/` (or run the app from your workstation),
then enter your router's IP and `root` credentials in the "Router Connection"
module.

## Why `service: [ "event" ]` is in the ACL
`uci commit` writes `/etc/config` but changes nothing on a running system. The
owning service reloads when it receives a `config.change` event, which is what
EZ-WRT sends after every commit. Without that permission, settings appear to
save and then have no effect.

