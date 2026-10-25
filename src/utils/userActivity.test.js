import { describe, expect, it } from 'vitest';
import {
  activityLevel,
  buildActivityDays,
  buildDailyActivityMatrix,
  buildHourlyActivity,
  collapseActivityDuplicates,
  detectDeviceType,
  formatActivityDayHeading,
  formatShortLastSeen,
  groupActivityByDay,
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

describe('user activity aggregation', () => {
  const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute).toISOString();
  const log = (id, createdAt, extra = {}) => ({
    id,
    user_id: 'u1',
    event_type: 'sign_in',
    device_type: 'desktop',
    created_at: createdAt,
    ...extra,
  });

  it('collapses same-user same-device rows closer than five minutes, keeping the newest time', () => {
    const entries = collapseActivityDuplicates([
      log('older', at(25, 12, 21)),
      log('newest', at(25, 12, 25)),
      log('middle', at(25, 12, 24), { event_type: 'session_start' }),
      log('other-device', at(25, 12, 25), { device_type: 'mobile' }),
      log('other-user', at(25, 12, 25), { user_id: 'u2' }),
      log('later-visit', at(25, 11, 59)),
    ]);

    expect(entries.map(entry => entry.id)).toEqual(['newest', 'other-device', 'other-user', 'later-visit']);
    expect(entries[0]).toMatchObject({ created_at: at(25, 12, 25), collapsedCount: 3, event_type: 'sign_in' });
    expect(entries[3].collapsedCount).toBe(1);
  });

  it('promotes a collapsed cluster to sign-in when it contains one', () => {
    const [entry] = collapseActivityDuplicates([
      log('open', at(25, 14, 12), { event_type: 'session_start' }),
      log('login', at(25, 14, 10)),
    ]);
    expect(entry).toMatchObject({ id: 'open', event_type: 'sign_in', collapsedCount: 2 });
  });

  it('builds a seven-day window, daily and hourly buckets, and intensity levels', () => {
    const days = buildActivityDays(new Date(2026, 9, 25, 9, 0));
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ key: '2026-10-19', shortDate: '19.10', isToday: false });
    expect(days[6]).toMatchObject({ key: '2026-10-25', isToday: true });

    const entries = [
      log('a', at(25, 8, 5)),
      log('b', at(25, 8, 50), { device_type: 'mobile' }),
      log('c', at(18, 8, 0)),
    ];
    const matrix = buildDailyActivityMatrix(entries, days);
    expect(matrix.u1['2026-10-25']).toMatchObject({ count: 2, devices: ['desktop', 'mobile'] });
    expect(matrix.u1['2026-10-18']).toBeUndefined();

    const hourly = buildHourlyActivity(entries, days);
    expect(hourly['2026-10-25'][8].count).toBe(2);
    expect(hourly['2026-10-25'][9].count).toBe(0);

    expect([0, 1, 2, 3].map(count => activityLevel(count))).toEqual([0, 1, 1, 2]);
    expect(activityLevel(2, 2)).toBe(2);
  });

  it('labels feed days and short last-seen times in Polish', () => {
    const now = new Date(2026, 9, 25, 14, 0);
    expect(formatActivityDayHeading(new Date(2026, 9, 25, 8), { now })).toBe('Dziś (25.10)');
    expect(formatActivityDayHeading(new Date(2026, 9, 24, 8), { now })).toBe('Wczoraj (24.10)');
    expect(formatActivityDayHeading(new Date(2026, 9, 22, 8), { now })).toBe('Czwartek (22.10)');
    expect(formatShortLastSeen(new Date(2026, 9, 24, 14, 12), { now })).toBe('24.10, 14:12');
    expect(formatShortLastSeen(new Date(2026, 9, 25, 9, 5), { now })).toBe('dziś, 09:05');

    const groups = groupActivityByDay([
      log('a', at(25, 9, 0)),
      log('b', at(25, 8, 0)),
      log('c', at(24, 8, 0)),
    ], { now });
    expect(groups.map(group => [group.label, group.entries.length])).toEqual([
      ['Dziś (25.10)', 2],
      ['Wczoraj (24.10)', 1],
    ]);
  });
});
