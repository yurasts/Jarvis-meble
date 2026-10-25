import path from 'node:path';
import {
  DELETED_FILES_FOLDER,
  DRIVE_CATEGORY_FOLDERS,
  LEGACY_DRIVE_CATEGORY_FOLDER_MIGRATIONS,
  PROJECT_MARKER_FILE,
} from './constants.js';

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
// Windows also rejects ASCII control characters in file and folder names.
// eslint-disable-next-line no-control-regex
const INVALID_WINDOWS_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]+/g;
const MAX_FOLDER_NAME_LENGTH = 120;

export const sanitizeWindowsFolderName = (value, fallback = 'Bez nazwy') => {
  let safe = String(value ?? '')
    .normalize('NFKC')
    .replace(INVALID_WINDOWS_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!safe) safe = fallback;
  if (WINDOWS_RESERVED_NAME.test(safe)) safe = `_${safe}`;
  safe = safe.slice(0, MAX_FOLDER_NAME_LENGTH).replace(/[. ]+$/g, '');
  return safe || fallback;
};

export const categoryForFolder = (folderName) => (
  DRIVE_CATEGORY_FOLDERS.find(item => item.folder === folderName)?.category
  || LEGACY_DRIVE_CATEGORY_FOLDER_MIGRATIONS.find(item => item.from === folderName)?.category
  || null
);

export const folderForCategory = (category) => (
  DRIVE_CATEGORY_FOLDERS.find(item => item.category === category)?.folder || null
);

export const normalizeRelativePath = (value) => {
  const normalized = path.posix.normalize(String(value ?? '').replaceAll('\\', '/'));
  if (!normalized || normalized === '.' || path.posix.isAbsolute(normalized)) {
    throw new Error('Relative file path is required.');
  }
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Relative file path cannot escape its category folder.');
  }
  return normalized;
};

export const isIgnoredLocalFile = (filePath) => {
  const normalized = String(filePath ?? '').replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  const name = parts.at(-1) || '';
  if (parts.includes(DELETED_FILES_FOLDER)) return true;
  if (name === PROJECT_MARKER_FILE || name.startsWith(`${PROJECT_MARKER_FILE}.tmp-`)) return true;
  if (/^(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(name)) return true;
  if (name.startsWith('~$')) return true;
  return /\.(bak|tmp)$/i.test(name);
};

export const getProjectNames = (project) => ({
  clientName: String(project?.client_name || project?.full_name || `Klient ${project?.id ?? ''}`).trim(),
  projectName: String(project?.project_name || project?.full_name || `Projekt ${project?.id ?? ''}`).trim(),
});

export const lifecycleBaseDirectory = (root, lifecycleStatus) => {
  if (lifecycleStatus === 'archived') return path.join(root, '_Archiwum');
  if (lifecycleStatus === 'trash') return path.join(root, '_Kosz');
  return root;
};

export const projectDirectoryFor = (root, project) => {
  const { clientName, projectName } = getProjectNames(project);
  return path.join(
    lifecycleBaseDirectory(root, project?.lifecycle_status),
    sanitizeWindowsFolderName(clientName),
    sanitizeWindowsFolderName(projectName),
  );
};

export const projectMarkerFor = (project, now = new Date()) => {
  const { clientName, projectName } = getProjectNames(project);
  return {
    projectId: project.id,
    clientName,
    projectName,
    lifecycleStatus: project.lifecycle_status || 'active',
    updatedAt: project.updated_at || now.toISOString(),
  };
};
