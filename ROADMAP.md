# EZ-WRT Feature Roadmap

This document outlines the priority features for the EZ-WRT smartphone-friendly frontend.

## 1. Guest WiFi (Priority: High) - *Current Focus*
- **User Need:** provide internet to visitors without sharing main credentials or LAN access.
- **Implementation:** A single toggle to enable/disable a secondary isolated SSID.

## 2. Device Management & "Pause" Button
- **User Need:** See who is connected and block specific devices (kids' consoles, unauthorized neighbors).
- **Implementation:** List devices from DHCP/hostapd with a "Pause" toggle using firewall rules.

## 3. Bedtime Mode (Parental Controls)
- **User Need:** Scheduled internet access for specific devices.
- **Implementation:** Time-based firewall rules for specific MAC addresses.

## 4. One-Tap VPN (WireGuard)
- **User Need:** Simple privacy toggle for all home traffic.
- **Implementation:** Manage WireGuard interface status and simple peer configuration.

## 5. Hardware Verification (Priority: High) - *Blocked on a spare router*
- **User Need:** Confidence that changes behave on a real router, not just the mock.
- **Implementation:** Clone the repo on the always-on Mac Studio and point the dev
  server at a spare OpenWrt box on the LAN. See "Verifying on real hardware" in
  `README_OPENWRT.md` for the open questions, in priority order — the first being
  whether `uci confirm` is accepted from a new session after reconnecting, which
  is what the Safe Apply rollback depends on.
