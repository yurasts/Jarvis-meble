import { describe, expect, it, vi } from 'vitest';
import { createProjectFileCountsRepository } from './projectFileCountsRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('projectFileCountsRepository', () => {
  it('maps grouped RPC rows to counts keyed by client id', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { client_id: 10, file_count: 3 },
        { client_id: 20, file_count: '7' },
      ],
      error: null,
    }));

    await expect(createProjectFileCountsRepository({ client: { rpc } }).list())
      .resolves.toEqual({ 10: 3, 20: 7 });
    expect(rpc).toHaveBeenCalledWith('get_project_file_counts');
  });

  it('returns an empty map when the RPC has no visible rows', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));

    await expect(createProjectFileCountsRepository({ client: { rpc } }).list())
      .resolves.toEqual({});
  });

  it('propagates RPC errors', async () => {
    const databaseError = new Error('RLS denied');
    const rpc = vi.fn(async () => ({ data: null, error: databaseError }));

    await expect(createProjectFileCountsRepository({ client: { rpc } }).list())
      .rejects.toBe(databaseError);
  });
});
