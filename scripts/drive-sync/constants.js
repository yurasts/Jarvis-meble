export const DEFAULT_SYNC_ROOT = String.raw`G:\Mój dysk\_Jarvis\Projekty`;
export const PROJECT_MARKER_FILE = '.jarvis-project.json';
export const DELETED_FILES_FOLDER = '_Usunięte';
export const PROJECT_FILES_BUCKET = 'project-files';

export const DRIVE_CATEGORY_FOLDERS = Object.freeze([
  Object.freeze({ category: 'zadanie', folder: '01_Zlecenie', label: 'Zadanie' }),
  Object.freeze({ category: 'projekt', folder: '02_Rozrys', label: 'Projekt' }),
  Object.freeze({ category: 'inne', folder: '03_Rozkrój', label: 'Krój' }),
  Object.freeze({ category: 'montaz', folder: '04_Montaż', label: 'Montaż' }),
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
