import qrcode from 'qrcode-generator';

/**
 * Escapes special characters (\ ; , : ") in WiFi QR code strings
 * per the WiFi QR code / MeCard barcode specification to prevent syntax injection.
 */
export const escapeWifiString = (str: string): string => {
  return (str || '').replace(/([\\;,:"])/g, '\\$1');
};

/** The `WIFI:` payload a phone reads from the QR code. */
export const wifiQrPayload = (ssid: string, key: string): string =>
  `WIFI:S:${escapeWifiString(ssid)};T:WPA;P:${escapeWifiString(key)};;`;

/** Maximum number of generated QR codes kept in memory. */
export const WIFI_QR_CACHE_LIMIT = 64;

// Keyed on the payload itself, not on the object it came from: the store
// replaces wifiConfig on every 15s poll, but the credentials usually haven't
// changed, so the Reed-Solomon encoding only has to run when they do.
const qrDataUrlCache = new Map<string, string>();

/**
 * Data URL of the QR code that joins the given Wi-Fi network. Generation costs
 * about 8-10ms on the main thread, so results are cached (FIFO, bounded).
 */
export const wifiQrDataUrl = (ssid: string, key: string): string => {
  const payload = wifiQrPayload(ssid, key);
  const cached = qrDataUrlCache.get(payload);
  if (cached !== undefined) return cached;

  const qr = qrcode(0, 'L');
  qr.addData(payload);
  qr.make();
  const dataUrl = qr.createDataURL(4);

  qrDataUrlCache.set(payload, dataUrl);
  if (qrDataUrlCache.size > WIFI_QR_CACHE_LIMIT) {
    const oldest = qrDataUrlCache.keys().next().value;
    if (oldest !== undefined) qrDataUrlCache.delete(oldest);
  }
  return dataUrl;
};
