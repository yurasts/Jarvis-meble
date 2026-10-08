import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useProjectItemPickers from './useProjectItemPickers';

const materials = [
  { id: 'board-a', name: 'PL W960 Biały', symbol: 'W960', category: 'Płyta', supplier: 'ABC' },
  { id: 'board-b', name: 'PL H3157 Dąb', symbol: 'H3157', category: 'Płyta', supplier: 'XYZ' },
  { id: 'hinge', name: 'Zawias 110 st', symbol: '71B', category: 'Zawiasy', supplier: 'ABC' },
];

const services = [
  { id: 'transport', name: 'Transport', price: 200 },
  { id: 'cutting', name: 'Cięcie płyty', price: 10 },
];

const createProps = (overrides = {}) => ({
  materials,
  services,
  selectedMaterials: [],
  selectedServices: [],
  isMobileVariant: false,
  currentProfile: { id: 'user-1', color: '#123456' },
  updateItems: vi.fn(),
  addItem: vi.fn(),
  addCustomItem: vi.fn(),
  finishEditing: vi.fn(),
  closeItemEditor: vi.fn(),
  ...overrides,
});

describe('useProjectItemPickers', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', callback => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters materials by query, category and supplier', () => {
    const { result } = renderHook(() => useProjectItemPickers(createProps()));

    expect(result.current.material.categoryOptions).toEqual(['Płyta', 'Zawiasy']);
    expect(result.current.material.supplierOptions).toEqual(['ABC', 'XYZ']);

    act(() => result.current.material.setSearchTerm('h3157'));
    expect(result.current.material.groups).toHaveLength(1);
    expect(result.current.material.groups[0].offers[0].id).toBe('board-b');

    act(() => {
      result.current.material.setSearchTerm('');
      result.current.material.setCategoryFilter('Płyta');
      result.current.material.setSupplierFilter('ABC');
    });
    expect(result.current.material.groups).toHaveLength(1);
    expect(result.current.material.groups[0].offers[0].id).toBe('board-a');
  });

  it('sorts and filters available services', () => {
    const { result } = renderHook(() => useProjectItemPickers(createProps()));

    expect(result.current.service.services.map(service => service.id)).toEqual(['cutting', 'transport']);

    act(() => result.current.service.setSearchTerm('trans'));
    expect(result.current.service.services.map(service => service.id)).toEqual(['transport']);
  });

  it('adds a selected material through the shared item action', () => {
    const props = createProps();
    const { result } = renderHook(() => useProjectItemPickers(props));

    act(() => result.current.material.select(materials[0]));

    expect(props.addItem).toHaveBeenCalledWith('calc_materials', [], materials[0]);
    expect(props.updateItems).not.toHaveBeenCalled();
  });

  it('merges quantities when replacement targets an already selected material', () => {
    const selectedMaterials = [
      { ...materials[0], quantity: 2, addedById: 'owner', addedByColor: '#abcdef' },
      { ...materials[1], quantity: 3 },
    ];
    const props = createProps({ selectedMaterials });
    const { result } = renderHook(() => useProjectItemPickers(props));

    act(() => result.current.material.startReplacement(0));
    act(() => result.current.material.select(materials[1]));

    expect(props.finishEditing).toHaveBeenCalledTimes(1);
    expect(props.updateItems).toHaveBeenCalledWith('calc_materials', [
      { ...materials[1], quantity: 5 },
    ]);
    expect(props.closeItemEditor).toHaveBeenCalledTimes(1);
  });
});
