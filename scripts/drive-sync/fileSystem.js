import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  DELETED_FILES_FOLDER,
  DRIVE_CATEGORY_FOLDERS,
  PROJECT_MARKER_FILE,
} from './constants.js';
import {
  isIgnoredLocalFile,
  normalizeRelativePath,
  projectDirectoryFor,
  projectMarkerFor,
} from './pathMapping.js';

const exists = async (target) => {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

export const readProjectMarker = async (projectDirectory) => {
  try {
    const raw = await readFile(path.join(projectDirectory, PROJECT_MARKER_FILE), 'utf8');
    const marker = JSON.parse(raw);
    return marker?.projectId == null ? null : marker;
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
};

export const writeProjectMarker = async (projectDirectory, marker) => {
  const target = path.join(projectDirectory, PROJECT_MARKER_FILE);
  const temporary = `${target}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
};

const walkForMarkers = async (directory, result, depth = 0) => {
  if (depth > 4 || !(await exists(directory))) return;
  const marker = await readProjectMarker(directory);
  if (marker) {
    result.set(String(marker.projectId), directory);
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (DRIVE_CATEGORY_FOLDERS.some(item => item.folder === entry.name)) continue;
    if (entry.name === DELETED_FILES_FOLDER) continue;
    await walkForMarkers(path.join(directory, entry.name), result, depth + 1);
  }
};

export const discoverProjectDirectories = async (root) => {
  const directories = new Map();
  await walkForMarkers(root, directories);
  return directories;
};

const collisionSafeDirectory = async (desiredDirectory, projectId, { allowUnmarked }) => {
  let candidate = desiredDirectory;
  let collisionNumber = 0;
  while (await exists(candidate)) {
    const marker = await readProjectMarker(candidate);
    if (String(marker?.projectId) === String(projectId)) return candidate;
    if (!marker && allowUnmarked && candidate === desiredDirectory) return candidate;
    collisionNumber += 1;
    const suffix = collisionNumber === 1 ? projectId : `${projectId}-${collisionNumber}`;
    candidate = `${desiredDirectory} [${suffix}]`;
  }
  return candidate;
};

export const ensureProjectDirectory = async ({ root, project, knownDirectories, now = new Date() }) => {
  const projectId = String(project.id);
  const desiredDirectory = projectDirectoryFor(root, project);
  const knownDirectory = knownDirectories.get(projectId);
  let targetDirectory = await collisionSafeDirectory(desiredDirectory, project.id, {
    allowUnmarked: !knownDirectory,
  });

  if (knownDirectory && path.resolve(knownDirectory) !== path.resolve(targetDirectory)) {
    if (await exists(targetDirectory)) {
      throw new Error(`Duplicate project marker ${project.id}: ${knownDirectory} and ${targetDirectory}`);
    }
    await mkdir(path.dirname(targetDirectory), { recursive: true });
    await rename(knownDirectory, targetDirectory);
  } else if (knownDirectory) {
    targetDirectory = knownDirectory;
  }

  await mkdir(targetDirectory, { recursive: true });
  for (const item of DRIVE_CATEGORY_FOLDERS) {
    await mkdir(path.join(targetDirectory, item.folder), { recursive: true });
  }
  await mkdir(path.join(targetDirectory, DELETED_FILES_FOLDER), { recursive: true });
  const nextMarker = projectMarkerFor(project, now);
  const currentMarker = await readProjectMarker(targetDirectory);
  if (JSON.stringify(currentMarker) !== JSON.stringify(nextMarker)) {
    await writeProjectMarker(targetDirectory, nextMarker);
  }
  knownDirectories.set(projectId, targetDirectory);
  return targetDirectory;
};

const uniqueDeletedTarget = async (target, now) => {
  if (!(await exists(target))) return target;
  const parsed = path.parse(target);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(parsed.dir, `${parsed.name} (${stamp})${parsed.ext}`);
};

export const moveFileToDeleted = async ({ filePath, projectDirectory, relativePath, now = new Date() }) => {
  if (!(await exists(filePath))) return null;
  const projectRoot = path.resolve(projectDirectory);
  const source = path.resolve(filePath);
  const relativeSource = path.relative(projectRoot, source);
  if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
    throw new Error('Refusing to move a file outside the project directory.');
  }

  const safeRelativePath = normalizeRelativePath(relativePath);
  const requestedTarget = path.join(projectRoot, DELETED_FILES_FOLDER, ...safeRelativePath.split('/'));
  const target = await uniqueDeletedTarget(requestedTarget, now);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  return target;
};

const listFilesRecursively = async (directory, baseDirectory, category, result) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursively(absolutePath, baseDirectory, category, result);
      continue;
    }
    if (!entry.isFile() || isIgnoredLocalFile(absolutePath)) continue;
    const relativePath = normalizeRelativePath(path.relative(baseDirectory, absolutePath));
    result.push({ category, relativePath, absolutePath });
  }
};

export const listProjectWorkingFiles = async (projectDirectory) => {
  const files = [];
  for (const item of DRIVE_CATEGORY_FOLDERS) {
    const categoryDirectory = path.join(projectDirectory, item.folder);
    if (await exists(categoryDirectory)) {
      await listFilesRecursively(categoryDirectory, categoryDirectory, item.category, files);
    }
  }
  return files;
};

export const sha256File = async (filePath) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

export const writeFileAtomic = async (target, contents) => {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;
  await writeFile(temporary, contents);
  await rename(temporary, target);
};

export const uniqueSiblingPath = async (target, label = 'Jarvis') => {
  if (!(await exists(target))) return target;
  const parsed = path.parse(target);
  let suffix = 1;
  let candidate;
  do {
    candidate = path.join(parsed.dir, `${parsed.name} (${label} ${suffix})${parsed.ext}`);
    suffix += 1;
  } while (await exists(candidate));
  return candidate;
};

export const fileSize = async (filePath) => (await stat(filePath)).size;
