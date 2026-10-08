import { describe, expect, it } from 'vitest';
import { hasProjectFieldChanges } from './projectDirtyState';

const baseProject = {
  calc_materials: [{ id: 'm1', quantity: 2 }],
  calc_services: [{ id: 's1', quantity: 1 }],
  calc_expenses: [],
  tasks: [{ id: 't1', text: 'Zadanie' }],
  notes: 'Notatka',
  important_points: ['Ważne'],
  deadline: '2026-10-20',
  address: 'Gdańsk',
  phone: '123',
  client_name: 'Klient',
  project_name: 'Projekt',
  budget_coefficient: 2.6,
  budget: 1000,
};

describe('hasProjectFieldChanges', () => {
  it('returns false without an original project', () => {
    expect(hasProjectFieldChanges(baseProject, null)).toBe(false);
  });

  it('normalizes missing collections, strings, and coefficient defaults', () => {
    expect(hasProjectFieldChanges({}, {
      calc_materials: [],
      calc_services: [],
      calc_expenses: [],
      tasks: [],
      notes: '',
      important_points: [],
      deadline: '',
      address: '',
      phone: '',
      client_name: '',
      project_name: '',
      budget_coefficient: 2,
    })).toBe(false);
  });

  it('detects edits to persisted project fields', () => {
    expect(hasProjectFieldChanges(
      { ...baseProject, calc_materials: [{ id: 'm1', quantity: 3 }] },
      baseProject,
    )).toBe(true);
    expect(hasProjectFieldChanges(
      { ...baseProject, budget_coefficient: 2.7 },
      baseProject,
    )).toBe(true);
    expect(hasProjectFieldChanges(
      { ...baseProject, important_points: ['Inne'] },
      baseProject,
    )).toBe(true);
  });

  it('ignores derived budget changes', () => {
    expect(hasProjectFieldChanges(
      { ...baseProject, budget: 9999 },
      baseProject,
    )).toBe(false);
  });
});