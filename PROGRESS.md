# Development Progress Report: EZ-WRT Frontend

> **Historical log, not current state.** This records one earlier session. Some
> of its conclusions have since been superseded — see `STATUS.md` for where
> things actually stand.

This report summarizes the tasks completed, features implemented, and issues encountered during this development session.

## 1. Features Implemented & Improvements:

*   **Frontend & Mock Server Initialization:**
    *   Successfully started the EZ-WRT frontend development server using Vite (`npm run dev`).
    *   Successfully started a local mock server on `http://localhost:3001` for isolated frontend development.
    *   Resolved a critical `path-to-regexp` error in the `mock-server/index.cjs` that prevented it from starting.
*   **Desktop Layout Implementation:**
    *   Introduced a responsive, two-column CSS Grid layout for wider screens within `src/styles/main.css` and applied it to `src/App.tsx`. This significantly improves the application's usability on desktops and tablets.
*   **Calendar Versioning Automation:**
    *   Adopted a `YY.MM.PATCH` calendar versioning scheme for the project.
    *   Configured a `husky` pre-commit hook to automatically increment the patch version (`scripts/bump-version.js`) before every commit.
    *   Resolved a `ReferenceError: require is not defined` issue in the `bump-version.js` script by converting it to ES module syntax.
*   **`README.md` Documentation:**
    *   Created a comprehensive `README.md` file, detailing project features, OpenWrt router setup instructions, local development guidelines (including mock server and real router connection), Capacitor build/deploy steps, and theme customization.
    *   Updated the `README.md` to reflect the use of `apk` instead of `opkg` for package installation on OpenWrt 25.
*   **Real OpenWrt Router Connection Setup:**
    *   Modified `src/services/UbusClient.ts` to directly attempt connection to the real OpenWrt router at `http://192.168.2.1/ubus` by default, rather than relying on the Vite proxy for the mock server.

## 2. Key Issues Encountered & Debugging Path:

*   **Initial Frontend Server Startup:** Encountered Node.js version warnings and a `rollup` module error. Temporarily resolved with `npm install`, and later the user confirmed Node.js 22 was active.
*   **CORS Policy Block (Initial):**
    *   **Problem:** Frontend (`http://localhost:5174`) was blocked by CORS when attempting to access the OpenWrt router (`http://192.168.2.1/ubus`).
    *   **Initial Attempt:** Advised adding generic `Access-Control-Allow-Origin` headers to `uhttpd` config, which was insufficient.
    *   **Resolution:** Researched and identified the specific OpenWrt `uhttpd` configuration (`uci set uhttpd.main.ubus_cors='1'`) required to enable CORS for ubus calls. The user confirmed applying this fix.
*   **Login Failed (Code: Unknown) - `rpcd` / ACL Issues:**
    *   **Problem:** Even after the CORS fix, the frontend reported "Login failed (Code: Unknown). Check credentials and rpcd permissions."
    *   **Debugging Steps:**
        *   Verified `rpcd` and `ubusd` processes were running on the router.
        *   Attempted to get `rpcd` specific log output, which was unavailable.
        *   **Critical Finding:** A direct `ubus call session.login` command on the OpenWrt router itself resulted in "Command failed: Not found", indicating a fundamental problem with the `session` service being registered via `ubus`.
        *   **Resolution Attempt:** Researched OpenWrt `rpcd` ACL requirements more deeply. Discovered the `ezwrt.json` ACL file needed explicit `write` permissions for `ubus` `session:login`, which was missing in the original version. The user confirmed updating the `ezwrt.json` file with the corrected ACL.

## 3. Current Status & Next Steps (Pending User Action):

*   All frontend setup and styling changes are complete and committed.
*   The project now uses calendar versioning and automatic version bumping.
*   The frontend is configured to target the real OpenWrt router.
*   The critical CORS issue has been addressed on the router.
*   The `ezwrt.json` ACL file on the OpenWrt router has been updated to correctly allow `session.login`.
*   **Next Step (Awaiting User):** After the ACL update, the crucial step is to re-run the `ubus call session.login` command directly on the OpenWrt router to confirm it now succeeds. The user was asked to provide this output but indicated it was unavailable. Without this confirmation, the root cause of the login failure on the router cannot be definitively determined.
