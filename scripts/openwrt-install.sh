#!/bin/sh
# EZ-WRT one-shot installer for OpenWrt 25
# Run on the router via SSH:
#   wget -qO- https://raw.githubusercontent.com/ollisulopuisto/ezwrt-frontend/main/scripts/openwrt-install.sh | sh

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root."
  exit 1
fi

ACL_DIR="/usr/share/rpcd/acl.d"
ACL_FILE="$ACL_DIR/ezwrt.json"

echo ">>> EZ-WRT Installer"
echo ">>> Step 1: Installing required packages..."
apk update
apk add uhttpd uhttpd-mod-ubus rpcd

echo ">>> Step 2: Writing ACL file to $ACL_FILE..."
mkdir -p "$ACL_DIR"
cat > "$ACL_FILE" << 'EOF'
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
EOF

echo ">>> Step 3: Enabling and restarting services..."
/etc/init.d/rpcd enable
/etc/init.d/rpcd restart
/etc/init.d/uhttpd enable
/etc/init.d/uhttpd restart

echo ""
echo "=============================="
echo " EZ-WRT setup complete!"
echo "=============================="
echo " Open http://$(uci get network.lan.ipaddr 2>/dev/null || echo '<router-ip>') in your browser."
echo " Use your router's root credentials to log in."
echo ""
