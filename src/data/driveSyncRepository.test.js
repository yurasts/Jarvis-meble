import { describe, expect, it, vi } from 'vitest';
import { DRIVE_SYNC_STATE_COLUMNS, createDriveSyncRepository } from './driveSyncRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('driveSyncRepository', () => {
  it('loads only the singleton status row with an explicit column list', async () => {
    const row = { singleton_id: 1, locked_by_host: 'PC-A' };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createDriveSyncRepository({ client }).getState()).resolves.toBe(row);
    expect(client.from).toHaveBeenCalledWith('drive_sync_state');
    expect(select).toHaveBeenCalledWith(DRIVE_SYNC_STATE_COLUMNS);
    expect(eq).toHaveBeenCalledWith('singleton_id', 1);
  });
});
