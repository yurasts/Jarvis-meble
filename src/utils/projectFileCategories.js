// Папки файлов проекта. `id` — значение project_files.category в Supabase: его нельзя
// переименовывать, иначе уже загруженные файлы «потеряются» из своей папки. Меняются только
// подписи и порядок отображения.
//
// Исторически id и подписи не совпадают: 'usterki' показывается как «Projekt», 'projekt' —
// как «Zadanie», 'inne' — как «Krój» (до 2026-10 — «Inne»).
export const PROJECT_FILE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'usterki', label: 'Projekt', icon: '⚠' }),
  Object.freeze({ id: 'projekt', label: 'Zadanie', icon: '📐' }),
  Object.freeze({ id: 'inne',    label: 'Krój',    icon: '📏' }),
  Object.freeze({ id: 'montaz',  label: 'Montaż',  icon: '✅' }),
]);

// Папка, открытая по умолчанию при выборе проекта.
export const DEFAULT_PROJECT_FILE_CATEGORY = 'usterki';

export const findProjectFileCategory = (id) =>
  PROJECT_FILE_CATEGORIES.find(category => category.id === id) || null;
