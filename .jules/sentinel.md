# Sentinel Security Journal

This journal records critical security learnings, vulnerability patterns specific to the EZ-WRT codebase, and reusable security principles for router management.

## 2026-11-06 - Store Boundary Defense-in-Depth for UCI Router Operations
**Vulnerability:** Invoking router mutation actions (`toggleDeviceInternet`, `setDeviceSchedule`) directly through the store without store-boundary input validation permitted `runChange` to transition into `loading: true` and attempt execution before client-level rejection, causing inconsistent UI states or potentially malformed section parameters.
**Learning:** In asynchronous state stores managing critical network infrastructure (like OpenWrt UCI firewall rules and Bedtime schedules), parameter validation must occur at the store entry point *before* side effects (such as setting loading flags or scheduling apply rollbacks) are initiated, even when lower-level RPC clients also validate parameters.
**Prevention:** Enforce defense-in-depth: every store action accepting router/firewall parameters (MAC addresses, ports, IPs, time intervals, SSIDs) must validate against strict format constraints prior to dispatching state changes.

## 2026-11-15 - Hardcoded Default Credentials in UbusClient
**Vulnerability:** `UbusClient` initializes `username = 'root'` and `password = 'admin'` as hardcoded defaults, used as fallback credentials when `login()` is invoked without arguments (which `call()` does when no session exists). This contradicts the documented "No default password" security property and is a hardcoded secret that could become reachable if `call()` is ever invoked without `setCredentials()` being called first (e.g., via future refactoring or a new code path).
**Learning:** Default credential values in RPC client classes are a latent hardcoded-secret risk even when current call sites always set credentials first; defense in depth requires no hardcoded fallback credentials at all.
**Prevention:** Initialize credential fields as empty strings and require `setCredentials()` to be called before any authenticated call; reject login attempts with empty/missing credentials rather than falling back to hardcoded values.

## 2026-11-15 - Sanitize RPC error messages before surfacing to UI
**Vulnerability:** The Zustand store surfaced raw `err.message` from RPC failures directly into UI state at four catch sites (`runChange`, `fetchData`, `confirmApply`, `rebootRouter`). A `UbusError` message is `RPC error: uci.set (invalid command)` — it names the router object, method, and status code, giving an attacker reconnaissance detail usable to probe router configuration.
**Learning:** Error objects thrown by the RPC client contain internal implementation detail (object name, method, status code). The catch boundary must never trust or forward raw error text to the UI. `instanceof UbusError` also fails across vitest module boundaries due to class-instance identity, so a structural check (`name === 'UbusError'` plus `code`/`message` pattern) is more reliable.
**Prevention:** Route every error bound for UI state through a `routerErrorMessage` helper that returns a generic message for RPC errors and a generic connection message otherwise; never interpolate `err.message` into user-facing strings.

## 2026-11-15 - Credential-bearing RPC must fail closed on HTTP redirects
**Vulnerability:** The ubus RPC transport relied on Fetch's default redirect behaviour. A 307/308 response makes the browser replay the original method and body at the Location origin, so a redirecting or spoofed endpoint could receive the router credentials and session token the client had just sent.
**Learning:** Any client that puts secrets in a request body must choose redirect handling explicitly; "follow" is only safe when every possible destination is trusted. A single fixed RPC endpoint has no legitimate redirect.
**Prevention:** Set `redirect: 'error'` for requests carrying credentials or session tokens. Regression coverage needs a real redirector plus collector server pair that proves nothing is replayed.
