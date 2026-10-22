import { describe, expect, it } from 'vitest';
import {
  detectDeviceType,
  formatLastSeen,
  isUserOnline,
  summarizeUserAgent,
} from './userActivity';

describe('user activity formatting', () => {
  it('detects mobile by user agent or narrow viewport', () => {
    expect(detectDeviceType({ userAgent: 'Mozilla/5.0 (iPhone)', viewportWidth: 1200 })).toBe('mobile');
    expect(detectDeviceType({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', viewportWidth: 600 })).toBe('mobile');
    expect(detectDeviceType({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', viewportWidth: 1200 })).toBe('desktop');
  });

  it('stores a short browser and operating-system summary', () => {
    expect(summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36'))
      .toBe('Chrome · Windows');
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1'))
      .toBe('Safari · iOS');
  });

  it('uses the six-minute online window and a Polish last-seen label', () => {
    const now = new Date(2026, 9, 22, 14, 20);
    expect(isUserOnline(new Date(now.getTime() - 5 * 60 * 1000), now.getTime())).toBe(true);
    expect(isUserOnline(new Date(now.getTime() - 7 * 60 * 1000), now.getTime())).toBe(false);
    expect(formatLastSeen(new Date(2026, 9, 22, 14, 10), 'mobile', { now }))
      .toContain('Ostatnio: dziś');
    expect(formatLastSeen(new Date(2026, 9, 22, 14, 10), 'mobile', { now })).toContain('📱');
    expect(formatLastSeen(null, null, { now })).toBe('Brak danych');
  });
});
