import { describe, expect, it } from 'vitest';
import {
  findEquivalentMaterial,
  groupMaterialsForPicker,
  materialMatchesQuery,
} from './materialPickerGroups';

describe('materialPickerGroups', () => {
  const materials = [
    { id: 'board-a', name: 'PL W960 SM Bia\u0142y Klasyczny', symbol: 'PL W960 SM', category: 'P\u0142yta', supplier: 'ABC' },
    { id: 'board-b', name: 'W960 SM Bia\u0142y klasyczny', symbol: 'W960', category: 'P\u0142yta', supplier: 'XYZ' },
    { id: 'abs-thin', name: 'ABS W960 SM Bia\u0142y (23\u00d70,8)', symbol: 'ABS W960 SM', category: 'Obrze\u017ce', supplier: 'ABC' },
    { id: 'abs-thick', name: 'ABS W960 SM Bia\u0142y (43\u00d72,0)', symbol: 'ABS W960 SM', category: 'Obrze\u017ce', supplier: 'ABC' },
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

  it('finds a non-board material by manufacturer symbol despite different invoice wording', () => {
    const equivalent = findEquivalentMaterial([{
      id: 'hinge',
      name: 'Zawias 110° nakładany Blum CLIP top BLUMOTION',
      symbol: '71B3550',
      category: 'Akcesoria',
    }], {
      id: 'candidate',
      name: 'Blum zawias nakładany z domykiem',
      symbol: '71B3550',
      category: 'Zawiasy',
    });

    expect(equivalent?.id).toBe('hinge');
  });

  it('keeps compact H1367 boards and both ABS cross-sections unambiguous', () => {
    const compactMaterials = [
      { id: 'h1367-board', name: 'PL H1367 ST40 Dąb Casella naturalny jasny', symbol: 'PL H1367 ST40', category: 'Płyta' },
      { id: 'h1367-edge-thin', name: 'ABS H1367 ST40 Dąb Casella naturalny jasny (23×0,8)', symbol: 'ABS H1367 ST40', category: 'Obrzeże' },
      { id: 'h1367-edge-thick', name: 'ABS H1367 ST40 Dąb Casella naturalny jasny (43×2,0)', symbol: 'ABS H1367 ST40', category: 'Obrzeże' },
    ];

    const groups = groupMaterialsForPicker(compactMaterials);
    expect(groups.map(group => group.key)).toEqual(expect.arrayContaining([
      'board|H1367',
      'abs|H1367|23x0.8',
      'abs|H1367|43x2.0',
    ]));
  });
});
