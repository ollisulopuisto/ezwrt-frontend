# Sentinel Security Journal

This journal records critical security learnings, vulnerability patterns specific to the EZ-WRT codebase, and reusable security principles for router management.

## 2026-11-06 - Store Boundary Defense-in-Depth for UCI Router Operations
**Vulnerability:** Invoking router mutation actions (`toggleDeviceInternet`, `setDeviceSchedule`) directly through the store without store-boundary input validation permitted `runChange` to transition into `loading: true` and attempt execution before client-level rejection, causing inconsistent UI states or potentially malformed section parameters.
**Learning:** In asynchronous state stores managing critical network infrastructure (like OpenWrt UCI firewall rules and Bedtime schedules), parameter validation must occur at the store entry point *before* side effects (such as setting loading flags or scheduling apply rollbacks) are initiated, even when lower-level RPC clients also validate parameters.
**Prevention:** Enforce defense-in-depth: every store action accepting router/firewall parameters (MAC addresses, ports, IPs, time intervals, SSIDs) must validate against strict format constraints prior to dispatching state changes.
