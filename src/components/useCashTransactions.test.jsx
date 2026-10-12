import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useCashTransactions from './useCashTransactions';

vi.mock('../data/projectCashTransactionsRepository', () => ({ default: {} }));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createRepository = (overrides = {}) => ({
  list: vi.fn(async () => []),
  save: vi.fn(),
  remove: vi.fn(),
  ...overrides,
});

const setup = (repository, scopeKey = 'user-1', projectScope = 'firma') => {
  const props = { scopeKey, projectScope, repository };
  return {
    ...renderHook(currentProps => useCashTransactions(currentProps), { initialProps: props }),
    props,
  };
};

describe('useCashTransactions', () => {
  it('loads the visible ledger for the authenticated scope', async () => {
    const transactions = [{ id: 'cash-1' }];
    const repository = createRepository({ list: vi.fn(async () => transactions) });
    const hook = setup(repository);

    expect(hook.result.current.cashStatus).toBe('loading');
    await waitFor(() => expect(hook.result.current.cashStatus).toBe('ready'));
    expect(hook.result.current.cashTransactions).toEqual(transactions);
    expect(repository.list).toHaveBeenCalledWith('firma');
  });

  it('does not expose a response from the previous authenticated scope', async () => {
    const first = deferred();
    const second = deferred();
    const repository = createRepository({
      list: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    const hook = setup(repository);

    hook.rerender({ ...hook.props, scopeKey: 'user-2:personal', projectScope: 'personal' });
    await act(async () => first.resolve([{ id: 'old-cash' }]));

    expect(hook.result.current.cashStatus).toBe('loading');
    expect(hook.result.current.cashTransactions).toEqual([]);

    await act(async () => second.resolve([{ id: 'new-cash' }]));
    expect(hook.result.current.cashStatus).toBe('ready');
    expect(hook.result.current.cashTransactions).toEqual([{ id: 'new-cash' }]);
    expect(repository.list).toHaveBeenNthCalledWith(2, 'personal');
  });

  it('does not let an older list response overwrite a completed mutation', async () => {
    const list = deferred();
    const saved = { id: 'cash-2', project_id: 42 };
    const repository = createRepository({
      list: vi.fn(() => list.promise),
      save: vi.fn(async () => saved),
    });
    const hook = setup(repository);

    await act(async () => {
      await hook.result.current.saveCashTransaction(42, { direction: 'inflow' });
    });
    expect(hook.result.current.cashTransactions).toEqual([saved]);

    await act(async () => list.resolve([{ id: 'older-cash' }]));
    expect(hook.result.current.cashTransactions).toEqual([saved]);
  });

  it('retries a failed load and replaces the error state', async () => {
    const repository = createRepository({
      list: vi.fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce([{ id: 'cash-1' }]),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.cashStatus).toBe('error'));

    let retried;
    await act(async () => {
      retried = await hook.result.current.loadCashTransactions();
    });

    expect(retried).toBe(true);
    expect(hook.result.current.cashStatus).toBe('ready');
    expect(hook.result.current.cashTransactions).toEqual([{ id: 'cash-1' }]);
  });

  it('updates and removes persisted transactions', async () => {
    const original = { id: 'cash-1', description: 'Old' };
    const updated = { id: 'cash-1', description: 'New' };
    const repository = createRepository({
      list: vi.fn(async () => [original]),
      save: vi.fn(async () => updated),
      remove: vi.fn(async () => {}),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.cashStatus).toBe('ready'));

    await act(async () => {
      await hook.result.current.saveCashTransaction(42, { id: 'cash-1' });
    });
    expect(hook.result.current.cashTransactions).toEqual([updated]);

    await act(async () => {
      await hook.result.current.deleteCashTransaction('cash-1');
    });
    expect(hook.result.current.cashTransactions).toEqual([]);
  });
});
