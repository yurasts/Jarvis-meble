import { describe, expect, it } from 'vitest';
import { calculateClientWycena, calculateProjectWycena, projectTotals } from './projectPricing';

describe('project pricing', () => {
  it('multiplies only materials and adds services once', () => {
    expect(calculateProjectWycena({
      materialsTotal: 2780.70,
      servicesTotal: 605.80,
      multiplier: 2,
    })).toBeCloseTo(6167.20, 2);
  });

  it('calculates totals using the established quantity rules', () => {
    const project = {
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
    };

    expect(projectTotals(project)).toEqual({
      materials: 250,
      services: 680,
      expenses: 45,
      total: 975,
    });
    expect(calculateClientWycena(project, 2)).toBe(1180);
  });

  it('uses the default multiplier for an invalid coefficient', () => {
    expect(calculateProjectWycena({ materialsTotal: 100, servicesTotal: 25 })).toBe(225);
  });
});
