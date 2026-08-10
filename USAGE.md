# EZ-WRT Usage Guide

EZ-WRT is a lightweight, smartphone-friendly frontend for OpenWrt 25.

## 1. On-Device Setup (OpenWrt)

Ensure your router has the necessary RPC components:
```bash
apk add uhttpd uhttpd-mod-ubus rpcd
```

Create the ACL file at `/usr/share/rpcd/acl.d/ezwrt.json`:
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
Enable the ubus HTTP bridge (`ubus_cors` is only needed when the app is not
served by the router itself):
```bash
uci set uhttpd.main.ubus_prefix='/ubus'
uci set uhttpd.main.ubus_cors='1'
uci commit uhttpd
```

Restart services: `/etc/init.d/rpcd restart && /etc/init.d/uhttpd restart`.

## 2. Using the Web App
1. Open the hosted URL or your local build.
2. In the "Router Connection" module, enter your router's IP (e.g., `192.168.1.1`).
3. Enter your router's `root` credentials.
4. Click "Update & Connect".

The Guest WiFi module appears once your wireless config contains a guest
interface — a section named `guest`, or any wireless section whose name or SSID
contains "guest". EZ-WRT toggles that section; it does not create one.

## 3. Smartphone App (Native)
The project is initialized with Capacitor for iOS and Android.

### Build and Sync:
```bash
npm run build
npx cap sync
```

### Open in IDEs:
- **iOS:** `npx cap open ios` (requires Xcode)
- **Android:** `npx cap open android` (requires Android Studio)

## 4. Customizing the Theme
Edit `src/styles/main.css` and modify the `:root` variables to change colors, fonts, and the overall look:
```css
:root {
  --primary: #your-color;
  --font-main: "Your Font", sans-serif;
}
```
