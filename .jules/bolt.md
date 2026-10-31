## 2026-10-28 - Memoize QR code generation for WiFi credentials
**Learning:** `WiFiModule` renders QR codes using `qrcode-generator`, which performs synchronous Reed-Solomon encoding and data URI string creation taking ~8-10ms per SSID on the main thread. Without memoization, any state change in `WiFiModule` (or store updates during periodic polling) triggers re-computation of all QR codes.
**Action:** Always memoize QR code generation with `useMemo` keyed by the underlying configuration (`wifiConfig`) so that expensive generation only runs when credentials actually change.
