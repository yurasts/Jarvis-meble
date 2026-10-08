import { describe, expect, it } from 'vitest';
import {
  findEquivalentMaterial,
  groupMaterialsForPicker,
  materialMatchesQuery,
} from './materialPickerGroups';

describe('materialPickerGroups', () => {
  const materials = [
    { id: 'board-a', name: 'PL W960 2800x2070x18 Bia\u0142y', symbol: 'W960', category: 'P\u0142yta', supplier: 'ABC' },
    { id: 'board-b', name: 'W960 SM Bia\u0142y klasyczny', symbol: 'W960', category: 'P\u0142yta', supplier: 'XYZ' },
    { id: 'abs-thin', name: 'ABS W960 23x0,8mm Bia\u0142y', symbol: 'W960', category: 'Obrze\u017ce', supplier: 'ABC' },
    { id: 'abs-thick', name: 'ABS W960 43x2,0mm Bia\u0142y', symbol: 'W960', category: 'Obrze\u017ce', supplier: 'ABC' },
  ];

  it('groups equivalent boards while keeping ABS dimensions separate', () => {
    const groups = groupMaterialsForPicker(materials);
    const boardGroup = groups.find(group => group.key === 'board|W960');
    const absGroups = groups.filter(group => group.kind === 'abs');

    expect(boardGroup.offers.map(offer => offer.id)).toEqual(['board-a', 'board-b']);
    expect(absGroups).toHaveLength(2);
    expect(absGroups.map(group => group.offers[0].id)).toEqual(
      expect.arrayContaining(['abs-thin', 'abs-thick']),
    );
  });

  it('matches names, symbols, categories and suppliers without Polish diacritics', () => {
    const material = {
      name: 'P\u0142yta D\u0105b \u0141\u00f3dzki',
      symbol: 'H3157',
      category: 'P\u0142yta',
      supplier: '\u017buraw',
    };

    expect(materialMatchesQuery(material, 'plyta dab lodzki')).toBe(true);
    expect(materialMatchesQuery(material, 'h3157')).toBe(true);
    expect(materialMatchesQuery(material, 'zuraw')).toBe(true);
    expect(materialMatchesQuery(material, 'zawias')).toBe(false);
  });

  it('finds an equivalent material using the same identity rules as the picker', () => {
    const equivalent = findEquivalentMaterial(materials, {
      id: 'candidate',
      name: 'P\u0142yta W960 Bia\u0142y',
      symbol: 'W960',
      category: 'P\u0142yta',
    });

    expect(equivalent?.id).toBe('board-a');
  });
});
