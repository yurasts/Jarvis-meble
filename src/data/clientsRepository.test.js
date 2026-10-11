import { describe, expect, it, vi } from 'vitest';
import { CLIENT_COLUMNS, createClientsRepository } from './clientsRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('clientsRepository', () => {
  it('lists only rows returned by Supabase RLS', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const select = vi.fn(async () => ({ data: rows, error: null }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createClientsRepository({ client }).list()).resolves.toEqual(rows);
    expect(client.from).toHaveBeenCalledWith('clients');
    expect(select).toHaveBeenCalledWith(CLIENT_COLUMNS);
  });

  it('creates and returns one client', async () => {
    const fields = { client_name: 'Nowak', status: 'new' };
    const saved = { id: 42, ...fields };
    const single = vi.fn(async () => ({ data: saved, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const client = { from: vi.fn(() => ({ insert })) };

    await expect(createClientsRepository({ client }).create(fields)).resolves.toEqual(saved);
    expect(insert).toHaveBeenCalledWith([fields]);
  });

  it('updates fields without requesting a row when no response is needed', async () => {
    const eq = vi.fn(async () => ({ data: null, error: null }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) };
    const fields = { status: 'production' };

    await createClientsRepository({ client }).update(42, fields);

    expect(update).toHaveBeenCalledWith(fields);
    expect(eq).toHaveBeenCalledWith('id', 42);
  });

  it('returns the persisted row after an update', async () => {
    const saved = { id: 42, budget_coefficient: 2.5, budget: 5000 };
    const single = vi.fn(async () => ({ data: saved, error: null }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) };

    await expect(createClientsRepository({ client }).updateAndGet(42, {
      budget_coefficient: 2.5,
      budget: 5000,
    })).resolves.toEqual(saved);
    expect(eq).toHaveBeenCalledWith('id', 42);
  });

  it('throws the original database error', async () => {
    const databaseError = new Error('RLS denied');
    const select = vi.fn(async () => ({ data: null, error: databaseError }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createClientsRepository({ client }).list()).rejects.toBe(databaseError);
  });
});
