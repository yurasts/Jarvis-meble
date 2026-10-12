import { describe, expect, it, vi } from 'vitest';
import {
  CASH_TRANSACTION_COLUMNS,
  createProjectCashTransactionsRepository,
} from './projectCashTransactionsRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

const draft = {
  direction: 'inflow',
  amount: 1250,
  occurred_on: '2026-10-10',
  description: 'Zaliczka',
};

const mutationClient = (method, result) => {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const mutation = vi.fn(() => method === 'update' ? { eq } : { select });
  const table = { [method]: mutation };
  return { client: { from: vi.fn(() => table) }, mutation, eq, select };
};

describe('projectCashTransactionsRepository', () => {
  it('returns only transactions from the requested project scope', async () => {
    const rows = [{ id: 'cash-1' }];
    const scopedRows = [{ ...rows[0], clients: { project_scope: 'firma' } }];
    const eq = vi.fn(async () => ({ data: scopedRows, error: null }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createProjectCashTransactionsRepository({ client }).list('firma')).resolves.toEqual(rows);
    expect(client.from).toHaveBeenCalledWith('project_cash_transactions');
    expect(select).toHaveBeenCalledWith(
      `${CASH_TRANSACTION_COLUMNS},clients!inner(project_scope)`,
    );
    expect(eq).toHaveBeenCalledWith('clients.project_scope', 'firma');
  });

  it('inserts a new transaction with its project id', async () => {
    const saved = { id: 'cash-1', project_id: 42, ...draft };
    const { client, mutation: insert, select } = mutationClient('insert', { data: saved, error: null });

    await expect(createProjectCashTransactionsRepository({ client }).save(42, draft)).resolves.toEqual(saved);
    expect(insert).toHaveBeenCalledWith([{ project_id: 42, ...draft }]);
    expect(select).toHaveBeenCalledWith(CASH_TRANSACTION_COLUMNS);
  });

  it('updates only editable fields of an existing transaction', async () => {
    const saved = { id: 'cash-1', project_id: 42, ...draft };
    const { client, mutation: update, eq } = mutationClient('update', { data: saved, error: null });

    await createProjectCashTransactionsRepository({ client }).save(99, { id: 'cash-1', ...draft });

    expect(update).toHaveBeenCalledWith(draft);
    expect(eq).toHaveBeenCalledWith('id', 'cash-1');
  });

  it('throws database errors without changing their identity', async () => {
    const databaseError = new Error('RLS denied');
    const eq = vi.fn(async () => ({ data: null, error: databaseError }));
    const client = { from: vi.fn(() => ({ delete: vi.fn(() => ({ eq })) })) };

    await expect(createProjectCashTransactionsRepository({ client }).remove('cash-1'))
      .rejects.toBe(databaseError);
  });
});
