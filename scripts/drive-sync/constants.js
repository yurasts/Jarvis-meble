export const DEFAULT_SYNC_ROOT = String.raw`G:\Mój dysk\_Jarvis\Projekty`;
export const PROJECT_MARKER_FILE = '.jarvis-project.json';
export const DELETED_FILES_FOLDER = '_Usunięte';
export const PROJECT_FILES_BUCKET = 'project-files';

export const DRIVE_CATEGORY_FOLDERS = Object.freeze([
  Object.freeze({ category: 'zadanie', folder: '01_Zadanie', label: 'Zadanie' }),
  Object.freeze({ category: 'projekt', folder: '02_Projekt', label: 'Projekt' }),
  Object.freeze({ category: 'inne', folder: '03_Krój', label: 'Krój' }),
  Object.freeze({ category: 'montaz', folder: '04_Montaż', label: 'Montaż' }),
]);

export const LEGACY_DRIVE_CATEGORY_FOLDER_MIGRATIONS = Object.freeze([
  Object.freeze({ category: 'zadanie', from: '01_Zlecenie', to: '01_Zadanie' }),
  Object.freeze({ category: 'projekt', from: '02_Rozrys', to: '02_Projekt' }),
  Object.freeze({ category: 'inne', from: '03_Rozkrój', to: '03_Krój' }),
]);

// project_files predates the current UI names: `usterki` is displayed as Projekt,
// while `projekt` is displayed as Zadanie. Keep this adapter at the boundary so
// drive metadata can use canonical names without rewriting production rows.
export const DRIVE_TO_JARVIS_CATEGORY = Object.freeze({
  zadanie: 'projekt',
  projekt: 'usterki',
  inne: 'inne',
  montaz: 'montaz',
});

export const JARVIS_TO_DRIVE_CATEGORY = Object.freeze({
  usterki: 'projekt',
  projekt: 'zadanie',
  zadanie: 'zadanie',
  inne: 'inne',
  montaz: 'montaz',
  sto: 'projekt',
});
