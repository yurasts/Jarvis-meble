export const getSupplierGoogleMapsUrl = (supplier) => {
  const configuredUrl = supplier?.google_maps_url?.trim();
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {
      // Fall through to the address-based Google Maps search URL.
    }
  }

  const address = supplier?.address?.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};
