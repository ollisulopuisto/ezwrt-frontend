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

After creating the ACL file, restart the RPC and uHTTPd services:

```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

### 2. Local Development

To run EZ-WRT locally for development:

**Prerequisites:**

*   Node.js (version 20.19+ or 22.12+ recommended). *Your current Node.js version is 21.7.3. Please ensure you activate Node.js 22 as discussed.*
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
    node mock-server/index.cjs
    ```
    This will start the mock server on `http://localhost:3001`.
4.  **Start the Frontend Development Server:**
    To connect to the mock server (when `import.meta.env.DEV` is true), the Vite proxy is configured to forward `/ubus` requests to `http://localhost:3001`.
    ```bash
    npm run dev
    ```
    This will start the Vite development server, typically on `http://localhost:5173`. Open your browser to this address.

5.  **Connect to a Real OpenWrt Router:**
    Once the frontend is running, navigate to the "Router Connection" module within the application. Enter the IP address of your OpenWrt router (e.g., `192.168.2.1`). Use `root` as the username and `toor` as the password when prompted.

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
