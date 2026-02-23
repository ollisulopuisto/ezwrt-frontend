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
