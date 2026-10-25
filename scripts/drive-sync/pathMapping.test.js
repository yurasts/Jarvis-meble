// @vitest-environment node
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRIVE_CATEGORY_FOLDERS } from './constants.js';
import {
  categoryForFolder,
  folderForCategory,
  isIgnoredLocalFile,
  projectDirectoryFor,
  sanitizeWindowsFolderName,
} from './pathMapping.js';

describe('drive sync path mapping', () => {
  it('sanitizes forbidden Windows characters and trailing dots or spaces', () => {
    expect(sanitizeWindowsFolderName('  Kuchnia <A>:  ')).toBe('Kuchnia _A_');
    expect(sanitizeWindowsFolderName('Projekt...   ')).toBe('Projekt');
    expect(sanitizeWindowsFolderName('A/B\\C|D?E*F"')).toBe('A_B_C_D_E_F_');
  });

  it.each(['CON', 'prn', 'AUX.txt', 'NUL', 'COM1', 'lpt9'])(
    'protects the reserved Windows name %s',
    (name) => expect(sanitizeWindowsFolderName(name)).toBe(`_${name}`),
  );

  it('maps the four ordered folders to canonical Jarvis sync categories', () => {
    expect(DRIVE_CATEGORY_FOLDERS.map(({ folder, category }) => [folder, category])).toEqual([
      ['01_Zadanie', 'zadanie'],
      ['02_Projekt', 'projekt'],
      ['03_Krój', 'inne'],
      ['04_Montaż', 'montaz'],
    ]);
    for (const { folder, category } of DRIVE_CATEGORY_FOLDERS) {
      expect(categoryForFolder(folder)).toBe(category);
      expect(folderForCategory(category)).toBe(folder);
    }
    expect(categoryForFolder('01_Zlecenie')).toBe('zadanie');
    expect(categoryForFolder('02_Rozrys')).toBe('projekt');
    expect(categoryForFolder('03_Rozkrój')).toBe('inne');
  });

  it('routes lifecycle states to active, archive and trash roots', () => {
    const root = path.resolve('G:/sync');
    const project = { id: 5, client_name: 'Jan/Kowalski', project_name: 'Szafa*1' };
    expect(projectDirectoryFor(root, { ...project, lifecycle_status: 'active' }))
      .toBe(path.join(root, 'Jan_Kowalski', 'Szafa_1'));
    expect(projectDirectoryFor(root, { ...project, lifecycle_status: 'archived' }))
      .toBe(path.join(root, '_Archiwum', 'Jan_Kowalski', 'Szafa_1'));
    expect(projectDirectoryFor(root, { ...project, lifecycle_status: 'trash' }))
      .toBe(path.join(root, '_Kosz', 'Jan_Kowalski', 'Szafa_1'));
  });

  it.each([
    'drawing.bak',
    'render.tmp',
    '~$invoice.xlsx',
    'desktop.ini',
    'Thumbs.db',
    '.DS_Store',
    '.jarvis-project.json',
    '_Usunięte/old.pdf',
  ])('ignores temporary or service file %s', (name) => {
    expect(isIgnoredLocalFile(name)).toBe(true);
  });
});
