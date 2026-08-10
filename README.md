# EZ-WRT: Simplified OpenWrt Management

EZ-WRT is a modern, smartphone-friendly web interface for managing your OpenWrt router. It aims to simplify common router tasks with an intuitive design and a focus on essential features. This project is built using React, Vite, and Capacitor for cross-platform compatibility, allowing it to run as a web application or a native mobile app.

## Features

-   **Router Connection:** Easily connect to your OpenWrt router by entering its IP address.
-   **Status Monitoring:** View real-time system information, network statistics, and connected devices.
-   **Wi-Fi Management:** Configure your 2.4GHz and 5GHz Wi-Fi networks.
-   **Guest Wi-Fi:** (High Priority - Current Focus) A simple toggle to enable/disable an isolated guest network.
-   **Adblock Control:** Toggle ad-blocking functionality.
-   **VPN Management:** (WireGuard) One-tap control for your VPN interface.
-   **Device Management:** View connected devices and implement "pause" functionality using firewall rules.
-   **Bedtime Mode:** Set scheduled internet access for specific devices.
-   **Firewall Rules:** View and add basic firewall rules.
-   **Safe Apply:** Every change is applied with a 90-second rollback timer. If you
    don't confirm that you're still connected, the router restores the previous
    settings by itself — so a bad WiFi password, firewall rule or VPN toggle can't
    lock you out of your own network.

## Setup Instructions

### 1. On-Device Setup (OpenWrt Router)

Ensure your OpenWrt router has the necessary RPC components installed. Connect to your router via SSH and run:

```bash
apk update
apk add uhttpd uhttpd-mod-ubus rpcd
```

Create the ACL file at `/usr/share/rpcd/acl.d/ezwrt.json` to grant EZ-WRT the required permissions:

```json
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
```

Enable the ubus HTTP bridge. `ubus_cors` is required whenever the app is *not*
served by the router itself (phone app, dev machine) — browsers block
cross-origin ubus calls otherwise:

```bash
uci set uhttpd.main.ubus_prefix='/ubus'
uci set uhttpd.main.ubus_cors='1'
uci commit uhttpd
```

Then restart the RPC and uHTTPd services:

```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

> The `uci: [ ..., "apply", "confirm", "rollback" ]` ubus permissions are what
> make the safety net work — see below. `service: [ "event" ]` is the fallback
> path for routers whose rpcd has no `uci.apply`: committing a UCI change writes
> `/etc/config` but changes nothing until the owning service reloads, which is
> triggered by a `config.change` event.

### How Safe Apply works

Changing WiFi, firewall or VPN settings can cut the connection you are using to
make the change. EZ-WRT therefore never commits directly:

1. The change is staged (`uci set`/`uci add`), not committed.
2. `uci apply` runs with `rollback: true` and a 90-second timer. rpcd commits the
   change, reloads the affected services, and snapshots the previous config.
3. A banner appears with a countdown. Confirming calls `uci confirm`, which keeps
   the change; "Undo now" calls `uci rollback`.
4. If no confirmation arrives — because the change knocked you offline — the
   router restores the snapshot and reloads on its own.

The countdown is stored in `localStorage`, so if you get disconnected and come
back before the timer runs out, the confirmation prompt is still waiting. Only
one change can be pending at a time; other controls are disabled until you
confirm or undo. On a router whose rpcd predates `uci.apply`, EZ-WRT falls back
to a plain commit and says that rollback is unavailable.

### Serving EZ-WRT from the router (optional)

The installer prepares the router but does not ship the app. To host it there:

```bash
npm run build
ssh root@<router-ip> 'mkdir -p /www/ezwrt'
scp -r dist/* root@<router-ip>:/www/ezwrt/
```

Then open `http://<router-ip>/ezwrt/`. Served this way the app talks to `/ubus`
on the same origin, so no CORS exemption is needed.

### 2. Local Development

To run EZ-WRT locally for development:

**Prerequisites:**

*   Node.js 20.19+ or 22.12+ (required by Vite 7).
*   npm (comes with Node.js)
*   Git

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone [repository_url]
    cd ezwrt-frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the Mock Server (Optional, for frontend development without a router):**
    The mock server provides simulated UBUS responses, useful for developing UI components without a live OpenWrt device.
    ```bash
    npm run mock-server
    ```
    This will start the mock server on `http://localhost:3001`. It models UCI
    semantics (including rejecting `uci set` on a section that does not exist)
    and returns real ubus error codes for unimplemented calls, so a call that
    would fail on a router also fails here.
4.  **Start the Frontend Development Server:**
    To connect to the mock server (when `import.meta.env.DEV` is true), the Vite proxy is configured to forward `/ubus` requests to `http://localhost:3001`.
    ```bash
    npm run dev
    ```
    This will start the Vite development server, typically on `http://localhost:5173`. Open your browser to this address.

5.  **Connect to a Real OpenWrt Router:**
    Once the frontend is running, navigate to the "Router Connection" module within the application. Enter the IP address of your OpenWrt router (e.g., `192.168.1.1`), then your router's own `root` credentials.

    > Note: the router password is stored in `localStorage` so the dashboard can keep polling. Treat any device running EZ-WRT as trusted.

### 3. Build and Deploy (Capacitor for Native Mobile Apps)

The project is configured with Capacitor to build native iOS and Android applications.

1.  **Build the web application:**
    ```bash
    npm run build
    ```
2.  **Sync Capacitor assets:**
    ```bash
    npx cap sync
    ```
3.  **Open in IDEs:**
    *   **iOS:** (Requires Xcode)
        ```bash
        npx cap open ios
        ```
    *   **Android:** (Requires Android Studio)
        ```bash
        npx cap open android
        ```

### 4. Customizing the Theme

Edit `src/styles/main.css` and modify the `:root` variables to change colors, fonts, and the overall look of the application:

```css
:root {
  --primary: #your-color;
  --font-main: "Your Font", sans-serif;
  /* ... other theme variables ... */
}
```

### Calendar Versioning

This project now uses calendar versioning in the format `YY.MM.PATCH` (e.g., `26.02.0`). The patch version is automatically incremented on every commit via a `husky` pre-commit hook.
