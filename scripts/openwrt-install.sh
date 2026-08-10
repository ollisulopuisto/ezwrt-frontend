#!/bin/sh
# EZ-WRT one-shot installer for OpenWrt 25
# Run on the router via SSH:
#   wget -qO- https://raw.githubusercontent.com/ollisulopuisto/ezwrt-frontend/main/scripts/openwrt-install.sh | sh
#
# To also install a pre-built frontend, point EZWRT_DIST_URL at a .tar.gz of
# dist/ and give its SHA-256. The archive is unpacked as root, so it is verified
# before anything is written:
#
#   sha256sum ezwrt-dist.tar.gz          # Linux   (shasum -a 256 on macOS)
#   EZWRT_DIST_URL=https://example.com/ezwrt-dist.tar.gz \
#   EZWRT_DIST_SHA256=<hash> sh openwrt-install.sh
#
# EZWRT_DIST_INSECURE=1 skips verification. Only sensible for a URL you control
# on a network you trust, and it is loud about what it is giving up.

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root."
  exit 1
fi

ACL_DIR="/usr/share/rpcd/acl.d"
ACL_FILE="$ACL_DIR/ezwrt.json"
WWW_DIR="/www/ezwrt"

TARBALL=""
STAGE_DIR=""
cleanup() {
  [ -n "$TARBALL" ] && rm -f "$TARBALL"
  [ -n "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"
  return 0
}
trap cleanup EXIT INT TERM

sha256_of() { # sha256_of <file> -> prints hash, or fails
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    return 1
  fi
}

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
        "uci": [ "get", "changes" ],
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
        "uci": [ "add", "set", "delete", "commit", "apply", "confirm", "rollback" ],
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

  if [ -z "$EZWRT_DIST_SHA256" ] && [ "$EZWRT_DIST_INSECURE" != "1" ]; then
    echo "Error: EZWRT_DIST_SHA256 is not set." >&2
    echo "The archive is unpacked as root on your router, so it is verified first." >&2
    echo "Compute the hash where you built it:" >&2
    echo "  sha256sum ezwrt-dist.tar.gz     # Linux" >&2
    echo "  shasum -a 256 ezwrt-dist.tar.gz # macOS" >&2
    echo "then re-run with EZWRT_DIST_SHA256=<hash>." >&2
    echo "To skip verification anyway, set EZWRT_DIST_INSECURE=1." >&2
    exit 1
  fi

  TARBALL="$(mktemp /tmp/ezwrt-dist.XXXXXX)"
  wget -qO "$TARBALL" "$EZWRT_DIST_URL"

  if [ -n "$EZWRT_DIST_SHA256" ]; then
    EXPECTED="$(printf '%s' "$EZWRT_DIST_SHA256" | tr 'A-F' 'a-f')"
    ACTUAL="$(sha256_of "$TARBALL" | tr 'A-F' 'a-f')" || ACTUAL=""
    if [ -z "$ACTUAL" ]; then
      # Fail closed, and say why: an empty hash must never read as a mismatch.
      echo "Error: could not compute a checksum for the download." >&2
      echo "No working sha256sum, shasum or openssl was found, so the archive" >&2
      echo "cannot be verified. Install coreutils-sha256sum, or copy the files" >&2
      echo "over with scp instead." >&2
      exit 1
    fi
    if [ "$ACTUAL" != "$EXPECTED" ]; then
      echo "Error: checksum mismatch — refusing to install." >&2
      echo "  expected: $EXPECTED" >&2
      echo "  actual:   $ACTUAL" >&2
      exit 1
    fi
    echo "    checksum verified"
  else
    echo "    WARNING: EZWRT_DIST_INSECURE=1 — installing an unverified archive as root."
  fi

  # Absolute or parent paths in an archive can write outside the target.
  if tar -tzf "$TARBALL" | grep -qE '^/|(^|/)\.\.(/|$)'; then
    echo "Error: archive contains absolute or parent paths — refusing to extract." >&2
    exit 1
  fi

  # Unpack to a staging directory so a bad archive cannot leave /www/ezwrt
  # half-written.
  STAGE_DIR="$(mktemp -d /tmp/ezwrt-stage.XXXXXX)"
  tar -xzf "$TARBALL" -C "$STAGE_DIR"

  if [ ! -f "$STAGE_DIR/index.html" ]; then
    echo "Error: no index.html at the root of the archive." >&2
    echo "Pack the contents of dist/, not the dist/ directory itself:" >&2
    echo "  tar -czf ezwrt-dist.tar.gz -C dist ." >&2
    exit 1
  fi

  rm -rf "$WWW_DIR"
  mkdir -p "$WWW_DIR"
  cp -R "$STAGE_DIR/." "$WWW_DIR/"
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
