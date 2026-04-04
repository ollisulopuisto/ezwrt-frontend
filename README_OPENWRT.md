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
        "service": [ "list" ],
        "network.interface": [ "status", "up", "down" ],
        "network.device": [ "status" ],
        "system": [ "info", "reboot" ],
        "dhcp": [ "ipv4leases" ]
      }
    },
    "write": {
      "uci": [ "wireless", "adblock", "network", "firewall" ]
    }
  }
}
```

### 3. Restart Services
```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

### 4. Connection
Open `http://<YOUR_ROUTER_IP>` in your browser. Enter your router's IP address and `root` credentials in the "Router Connection" module.

