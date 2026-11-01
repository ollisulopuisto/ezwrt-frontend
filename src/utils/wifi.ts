/**
 * Escapes special characters (\ ; , : ") in WiFi QR code strings
 * per the WiFi QR code / MeCard barcode specification to prevent syntax injection.
 */
export const escapeWifiString = (str: string): string => {
  return (str || '').replace(/([\\;,:"])/g, '\\$1');
};
