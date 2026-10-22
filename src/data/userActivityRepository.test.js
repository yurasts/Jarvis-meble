import { describe, expect, it, vi } from 'vitest';
import { createUserActivityRepository } from './userActivityRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('userActivityRepository', () => {
  it('records activity only through the protected RPC contract', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const repository = createUserActivityRepository({ client: { rpc } });

    await repository.record({
      eventType: 'session_start',
      deviceType: 'mobile',
      userAgent: 'Safari · iOS',
    });

    expect(rpc).toHaveBeenCalledWith('record_user_activity', {
      p_event_type: 'session_start',
      p_device_type: 'mobile',
      p_user_agent: 'Safari · iOS',
    });
  });

  it('loads owner presence and latest logs with explicit columns', async () => {
    const presenceRows = [{ user_id: 'user-1', last_seen_at: '2026-10-22T10:00:00Z' }];
    const logRows = [{ id: 'log-1', user_id: 'user-1', event_type: 'sign_in' }];
    const presenceQuery = {
      select: vi.fn(() => presenceQuery),
      order: vi.fn(async () => ({ data: presenceRows, error: null })),
    };
    const logQuery = {
      select: vi.fn(() => logQuery),
      order: vi.fn(() => logQuery),
      limit: vi.fn(async () => ({ data: logRows, error: null })),
    };
    const from = vi.fn(table => (table === 'user_presence' ? presenceQuery : logQuery));
    const repository = createUserActivityRepository({ client: { from } });

    await expect(repository.listPresence()).resolves.toEqual(presenceRows);
    await expect(repository.listLogs({ limit: 50 })).resolves.toEqual(logRows);
    expect(from).toHaveBeenNthCalledWith(1, 'user_presence');
    expect(from).toHaveBeenNthCalledWith(2, 'user_activity_logs');
    expect(logQuery.limit).toHaveBeenCalledWith(50);
  });

  it('propagates owner read errors', async () => {
    const databaseError = new Error('RLS denied');
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(async () => ({ data: null, error: databaseError })),
    };
    const repository = createUserActivityRepository({ client: { from: () => query } });

    await expect(repository.listPresence()).rejects.toBe(databaseError);
  });
});
