#!/bin/sh
# EZ-WRT one-shot installer for OpenWrt 25
# Run on the router via SSH:
#   wget -qO- https://raw.githubusercontent.com/ollisulopuisto/ezwrt-frontend/main/scripts/openwrt-install.sh | sh
#
# To also install a pre-built frontend, point EZWRT_DIST_URL at a .tar.gz of dist/:
#   EZWRT_DIST_URL=https://example.com/ezwrt-dist.tar.gz sh openwrt-install.sh

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root."
  exit 1
fi

ACL_DIR="/usr/share/rpcd/acl.d"
ACL_FILE="$ACL_DIR/ezwrt.json"
WWW_DIR="/www/ezwrt"

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
EOF

# service.event is what makes committed changes take effect: procd reloads the
# owning service on a config.change event. Without it nothing applies.

echo ">>> Step 3: Enabling the ubus HTTP bridge..."
uci set uhttpd.main.ubus_prefix='/ubus'
# Required when the app is not served from the router itself (phone app, dev
# machine); browsers block cross-origin ubus calls otherwise. Requests are still
# authenticated with the router's own credentials.
uci set uhttpd.main.ubus_cors='1'
uci commit uhttpd

if [ -n "$EZWRT_DIST_URL" ]; then
  echo ">>> Step 4: Installing the frontend from $EZWRT_DIST_URL..."
  mkdir -p "$WWW_DIR"
  wget -qO /tmp/ezwrt-dist.tar.gz "$EZWRT_DIST_URL"
  tar -xzf /tmp/ezwrt-dist.tar.gz -C "$WWW_DIR"
  rm -f /tmp/ezwrt-dist.tar.gz
  INSTALLED_APP=1
else
  echo ">>> Step 4: Skipping frontend install (EZWRT_DIST_URL not set)."
  INSTALLED_APP=0
fi

echo ">>> Step 5: Enabling and restarting services..."
/etc/init.d/rpcd enable
/etc/init.d/rpcd restart
/etc/init.d/uhttpd enable
/etc/init.d/uhttpd restart

ROUTER_IP="$(uci get network.lan.ipaddr 2>/dev/null || echo '<router-ip>')"

echo ""
echo "=============================="
echo " EZ-WRT setup complete!"
echo "=============================="
if [ "$INSTALLED_APP" = "1" ]; then
  echo " Open http://$ROUTER_IP/ezwrt/ in your browser."
else
  echo " The router is now ready to serve EZ-WRT, but the app itself is not"
  echo " installed. Build and copy it from your workstation:"
  echo ""
  echo "   npm run build"
  echo "   scp -r dist/* root@$ROUTER_IP:$WWW_DIR/"
  echo ""
  echo " Then open http://$ROUTER_IP/ezwrt/ in your browser."
  echo " (Or just run the app from your workstation and point it at $ROUTER_IP.)"
fi
echo " Log in with your router's root credentials."
echo ""
