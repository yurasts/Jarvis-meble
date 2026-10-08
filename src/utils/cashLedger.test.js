import { describe, expect, it } from 'vitest';
import {
  plannedWycena,
  sortCashDesc,
  summarizeCash,
  transactionsForProject,
  transactionsForProjects,
} from './cashLedger';

const transactions = [
  { id: 'a', project_id: 'p1', direction: 'inflow', amount: '100', occurred_on: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
  { id: 'b', project_id: 'p1', direction: 'outflow', amount: 30, occurred_on: '2026-10-02', created_at: '2026-10-02T08:00:00Z' },
  { id: 'c', project_id: 'p2', direction: 'inflow', amount: 50, occurred_on: '2026-10-02', created_at: '2026-10-02T09:00:00Z' },
];

describe('cashLedger utilities', () => {
  it('filters transactions for one or multiple projects', () => {
    expect(transactionsForProject(transactions, 'p1').map(item => item.id)).toEqual(['a', 'b']);
    expect(transactionsForProjects(transactions, ['p2']).map(item => item.id)).toEqual(['c']);
  });

  it('summarizes inflows, outflows and balance', () => {
    expect(summarizeCash(transactions)).toEqual({
      wplaty: 150,
      wydatki: 30,
      saldo: 120,
    });
  });

  it('sorts by operation date and creation time, newest first', () => {
    expect(sortCashDesc(transactions).map(item => item.id)).toEqual(['c', 'b', 'a']);
    expect(transactions.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses a saved estimate when available', () => {
    expect(plannedWycena({ budget: '4200', budget_coefficient: 2.5 }, 1000)).toBe(4200);
  });

  it('falls back to project cost times coefficient', () => {
    expect(plannedWycena({ budget: 0, budget_coefficient: 2.5 }, 1000)).toBe(2500);
    expect(plannedWycena({}, 1000)).toBe(2000);
  });
});
