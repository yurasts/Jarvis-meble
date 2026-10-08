import { describe, expect, it } from 'vitest';
import { groupByClient, initials, nextTaskId, projectTotals } from './dashboardHelpers';

describe('dashboardHelpers', () => {
  it('builds compact initials with a safe fallback', () => {
    expect(initials('Jan Kowalski')).toBe('JK');
    expect(initials('anna maria nowak')).toBe('AM');
    expect(initials('')).toBe('?');
  });

  it('chooses the next numeric task id and ignores invalid ids', () => {
    expect(nextTaskId([{ id: 2 }, { id: '7' }, { id: 'draft' }])).toBe(8);
    expect(nextTaskId([])).toBe(1);
  });

  it('calculates all project cost categories with the established quantity rules', () => {
    const totals = projectTotals({
      calc_materials: [
        { price: 100, quantity: 2 },
        { price: 50, quantity: 1 },
        { price: 999, quantity: 0 },
      ],
      calc_services: [
        { price: 90, quantity: 2 },
        { price: 500, quantity: 0 },
      ],
      calc_expenses: [
        { price: 30, quantity: 0 },
        { price: 15 },
      ],
    });

    expect(totals).toEqual({
      materials: 250,
      services: 680,
      expenses: 45,
      total: 975,
    });
  });

  it('groups projects by client while preserving encounter order', () => {
    const grouped = groupByClient([
      { id: 1, client_name: 'Anna' },
      { id: 2, client_name: 'Bartosz' },
      { id: 3, client_name: 'Anna' },
    ]);

    expect(grouped.map(([name]) => name)).toEqual(['Anna', 'Bartosz']);
    expect(grouped[0][1].map(project => project.id)).toEqual([1, 3]);
  });
});
