import { describe, expect, it } from 'vitest';
import { sortMaterialsByWorkflow } from './materialSort';

describe('sortMaterialsByWorkflow', () => {
  it('orders materials according to the workshop workflow without mutating input', () => {
    const materials = [
      { id: 'other', name: 'Nogi Axilo', category: 'Akcesoria' },
      { id: 'runner', name: 'BLUM prowadnica Tandem', category: 'Prowadnice' },
      { id: 'tip-on', name: 'TIP-ON mocny', category: 'Akcesoria' },
      { id: 'hinge', name: 'Zawias Clip Top', category: 'Zawiasy' },
      { id: 'abs', name: 'ABS W960 23x0,8mm', category: 'Obrze?e' },
      { id: 'board', name: 'PL W960 2800x2070x18', category: 'P?yta' },
    ];

    const sorted = sortMaterialsByWorkflow(materials);

    expect(sorted.map(item => item.id)).toEqual([
      'board',
      'abs',
      'hinge',
      'tip-on',
      'runner',
      'other',
    ]);
    expect(materials[0].id).toBe('other');
  });
});
