import { describe, expect, it } from 'vitest';
import { getSupplierGoogleMapsUrl } from './supplierMaps';

describe('getSupplierGoogleMapsUrl', () => {
  it('prefers a valid configured HTTP(S) URL', () => {
    expect(getSupplierGoogleMapsUrl({
      google_maps_url: ' https://maps.app.goo.gl/example ',
      address: 'Gdańsk',
    })).toBe('https://maps.app.goo.gl/example');
  });

  it('builds a Google Maps search URL from the trimmed address', () => {
    expect(getSupplierGoogleMapsUrl({ address: '  ul. Długa 12, Gdańsk  ' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=ul.%20D%C5%82uga%2012%2C%20Gda%C5%84sk');
  });

  it('falls back from an invalid URL and returns null without an address', () => {
    expect(getSupplierGoogleMapsUrl({ google_maps_url: 'javascript:alert(1)', address: 'Warszawa' }))
      .toContain('https://www.google.com/maps/search/');
    expect(getSupplierGoogleMapsUrl({ google_maps_url: 'not-a-url', address: ' ' })).toBeNull();
  });
});
