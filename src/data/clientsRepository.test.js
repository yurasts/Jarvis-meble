import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_COLUMNS,
  CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE,
  LEGACY_CLIENT_COLUMNS,
  createClientsRepository,
} from './clientsRepository';

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

  it('reads the lifecycle and calculator_state columns', () => {
    expect(CLIENT_COLUMNS.split(',')).toEqual(expect.arrayContaining([
      'calculator_state', 'lifecycle_status', 'lifecycle_changed_at',
    ]));
    expect(LEGACY_CLIENT_COLUMNS).not.toContain('lifecycle');
    expect(LEGACY_CLIENT_COLUMNS).not.toContain('calculator_state');
    expect(CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE).not.toContain('calculator_state');
    expect(CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE).toContain('lifecycle_status');
  });

  it('falls back to legacy columns when BOTH newer migrations are missing (oldest possible database)', async () => {
    const missingColumn = { code: '42703', message: 'column clients.lifecycle_status does not exist' };
    const select = vi.fn(async columns => (columns === LEGACY_CLIENT_COLUMNS
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: missingColumn }));
    const client = { from: vi.fn(() => ({ select })) };
    const repository = createClientsRepository({ client });

    await expect(repository.list()).resolves.toEqual([
      { id: 1, calculator_state: {}, lifecycle_status: 'active', lifecycle_changed_at: null },
    ]);
    await repository.list();
    expect(select.mock.calls.map(([columns]) => columns)).toEqual([
      CLIENT_COLUMNS,
      CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE,
      LEGACY_CLIENT_COLUMNS,
      LEGACY_CLIENT_COLUMNS,
    ]);
  });

  // Zgłoszenie: po merge'u kodu Etapu B, przed `supabase db push` migracji calculator_state,
  // SELECT z pełnym CLIENT_COLUMNS padał (kolumna jeszcze nie istnieje) i cała lista projektów
  // się nie wczytywała ("Nie udało się załadować: projekty"). Lifecycle jest dużo starszą,
  // już-wgraną migracją — więc druga próba (bez calculator_state, z lifecycle) musi się powieść.
  it('falls back to columns without calculator_state when only that (newer) migration is missing', async () => {
    const missingColumn = { code: 'PGRST204', message: "Could not find the 'calculator_state' column of 'clients' in the schema cache" };
    const select = vi.fn(async columns => (columns === CLIENT_COLUMNS
      ? { data: null, error: missingColumn }
      : { data: [{ id: 1, lifecycle_status: 'archived', lifecycle_changed_at: '2026-01-01T00:00:00Z' }], error: null }));
    const client = { from: vi.fn(() => ({ select })) };
    const repository = createClientsRepository({ client });

    await expect(repository.list()).resolves.toEqual([
      { id: 1, lifecycle_status: 'archived', lifecycle_changed_at: '2026-01-01T00:00:00Z', calculator_state: {} },
    ]);
    await repository.list();
    expect(select.mock.calls.map(([columns]) => columns)).toEqual([
      CLIENT_COLUMNS,
      CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE,
      CLIENT_COLUMNS_WITHOUT_CALCULATOR_STATE,
    ]);
  });

  describe('update() tolerates a missing calculator_state column (migration not pushed yet)', () => {
    it('drops calculator_state from the payload and retries with the rest of the fields', async () => {
      const missingColumn = { code: 'PGRST204', message: "Could not find the 'calculator_state' column" };
      const calls = [];
      const update = vi.fn((fields) => {
        calls.push(fields);
        return { eq: vi.fn(async () => ('calculator_state' in fields
          ? { data: null, error: missingColumn }
          : { data: null, error: null })) };
      });
      const client = { from: vi.fn(() => ({ update })) };

      await createClientsRepository({ client })
        .update(42, { status: 'production', calculator_state: { modules: [] } });

      expect(calls).toEqual([
        { status: 'production', calculator_state: { modules: [] } },
        { status: 'production' },
      ]);
    });

    it('resolves without a second write when calculator_state was the only field', async () => {
      const missingColumn = { code: '42703' };
      const eq = vi.fn(async () => ({ data: null, error: missingColumn }));
      const update = vi.fn(() => ({ eq }));
      const client = { from: vi.fn(() => ({ update })) };

      await expect(createClientsRepository({ client }).update(42, { calculator_state: {} }))
        .resolves.toBeUndefined();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('still throws for an unrelated update error', async () => {
      const databaseError = new Error('RLS denied');
      const eq = vi.fn(async () => ({ data: null, error: databaseError }));
      const update = vi.fn(() => ({ eq }));
      const client = { from: vi.fn(() => ({ update })) };

      await expect(createClientsRepository({ client }).update(42, { calculator_state: {} }))
        .rejects.toBe(databaseError);
    });
  });

  it('changes the lifecycle of several projects in one request', async () => {
    const rows = [{ id: 1, lifecycle_status: 'archived', lifecycle_changed_at: '2026-10-17T10:00:00Z' }];
    const select = vi.fn(async () => ({ data: rows, error: null }));
    const inFilter = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ in: inFilter }));
    const client = { from: vi.fn(() => ({ update })) };

    await expect(createClientsRepository({ client }).setLifecycle([1, 2], 'archived')).resolves.toEqual(rows);
    expect(update).toHaveBeenCalledWith({ lifecycle_status: 'archived' });
    expect(inFilter).toHaveBeenCalledWith('id', [1, 2]);
  });

  it('explains a missing lifecycle migration', async () => {
    const select = vi.fn(async () => ({ data: null, error: { code: 'PGRST204' } }));
    const client = { from: vi.fn(() => ({ update: () => ({ in: () => ({ select }) }) })) };

    await expect(createClientsRepository({ client }).setLifecycle([1], 'trash'))
      .rejects.toMatchObject({ code: 'LIFECYCLE_MIGRATION_MISSING' });
  });

  it('renames a client in every project of the group and syncs full_name where it matched', async () => {
    const calls = [];
    const client = {
      from: vi.fn(() => ({
        update: (fields) => ({
          in: (column, ids) => ({
            select: async () => {
              calls.push({ fields, column, ids });
              return fields.client_name
                ? { data: ids.map(id => ({ id, client_name: fields.client_name, full_name: 'Stara' })), error: null }
                : { data: ids.map(id => ({ id, full_name: fields.full_name })), error: null };
            },
          }),
        }),
      })),
    };

    const rows = await createClientsRepository({ client }).renameClientGroup([1, 2, 3], [1, 2], 'Nowa');

    expect(calls).toEqual([
      { fields: { client_name: 'Nowa' }, column: 'id', ids: [1, 2, 3] },
      { fields: { full_name: 'Nowa' }, column: 'id', ids: [1, 2] },
    ]);
    expect(rows).toEqual([
      { id: 1, client_name: 'Nowa', full_name: 'Nowa' },
      { id: 2, client_name: 'Nowa', full_name: 'Nowa' },
      { id: 3, client_name: 'Nowa', full_name: 'Stara' },
    ]);
  });

  it('fails the rename when the client names cannot be updated', async () => {
    const databaseError = new Error('denied');
    const select = vi.fn(async () => ({ data: null, error: databaseError }));
    const client = { from: vi.fn(() => ({ update: () => ({ in: () => ({ select }) }) })) };

    await expect(createClientsRepository({ client }).renameClientGroup([1], [1], 'Nowa')).rejects.toBe(databaseError);
  });

  const deleteClient = (result) => {
    const select = vi.fn(async () => result);
    const eqStatus = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const del = vi.fn(() => ({ eq: eqId }));
    return { client: { from: vi.fn(() => ({ delete: del })) }, eqId, eqStatus };
  };

  it('permanently deletes only a trashed project', async () => {
    const { client, eqId, eqStatus } = deleteClient({ data: [{ id: 5 }], error: null });

    await expect(createClientsRepository({ client }).permanentlyDelete(5)).resolves.toBeUndefined();
    expect(eqId).toHaveBeenCalledWith('id', 5);
    expect(eqStatus).toHaveBeenCalledWith('lifecycle_status', 'trash');
  });

  it('treats a delete that RLS silently skipped as a refusal', async () => {
    const { client } = deleteClient({ data: [], error: null });

    await expect(createClientsRepository({ client }).permanentlyDelete(5))
      .rejects.toMatchObject({ code: 'PURGE_NOT_ALLOWED' });
  });
});
