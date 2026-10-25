import { describe, expect, it } from 'vitest';
import { driveSyncCounts, isDriveSyncActive } from './driveSyncStatus';

describe('drive sync owner status', () => {
  const now = new Date('2026-10-25T12:00:00.000Z').getTime();

  it('is active only with both a fresh heartbeat and a live lease', () => {
    expect(isDriveSyncActive({
      last_heartbeat_at: '2026-10-25T11:59:30.000Z',
      lease_until: '2026-10-25T12:00:30.000Z',
    }, now)).toBe(true);
    expect(isDriveSyncActive({
      last_heartbeat_at: '2026-10-25T11:55:00.000Z',
      lease_until: '2026-10-25T12:00:30.000Z',
    }, now)).toBe(false);
    expect(isDriveSyncActive({
      last_heartbeat_at: '2026-10-25T11:59:30.000Z',
      lease_until: '2026-10-25T11:59:59.000Z',
    }, now)).toBe(false);
  });

  it('normalizes missing summary counters to zero', () => {
    expect(driveSyncCounts({ last_sync_summary: { projects: 3, files: '12' } }))
      .toEqual({ projects: 3, files: 12 });
    expect(driveSyncCounts(null)).toEqual({ projects: 0, files: 0 });
  });
});
