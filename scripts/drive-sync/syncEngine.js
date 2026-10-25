import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DRIVE_CATEGORY_FOLDERS,
  DRIVE_TO_JARVIS_CATEGORY,
  JARVIS_TO_DRIVE_CATEGORY,
} from './constants.js';
import {
  discoverProjectDirectories,
  ensureProjectDirectory,
  fileSize,
  listProjectWorkingFiles,
  moveFileToDeleted,
  sha256File,
  uniqueSiblingPath,
  writeFileAtomic,
} from './fileSystem.js';
import { normalizeRelativePath, sanitizeWindowsFolderName } from './pathMapping.js';
import { shouldTransferByHash, syncEntryKey } from './syncDecisions.js';

const MIME_BY_EXTENSION = Object.freeze({
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.sto': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
});

const mimeTypeFor = fileName => MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] || 'application/octet-stream';

const storageFileName = (relativePath) => String(relativePath)
  .normalize('NFKC')
  // Keep Storage object names portable to every Windows agent.
  // eslint-disable-next-line no-control-regex
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  .replace(/\s+/g, '_')
  .slice(-160) || 'file';

const storagePathFor = ({ projectId, category, relativePath, sha256, now }) => {
  const timestamp = now.toISOString().replace(/[^0-9]/g, '');
  return `${projectId}/drive-sync/${category}/${timestamp}_${sha256.slice(0, 12)}_${storageFileName(relativePath)}`;
};

const categoryDirectory = (projectDirectory, category) => {
  const folder = DRIVE_CATEGORY_FOLDERS.find(item => item.category === category)?.folder;
  if (!folder) throw new Error(`Unsupported drive category: ${category}`);
  return path.join(projectDirectory, folder);
};

const indexEntries = (entries) => {
  const byKey = new Map();
  const byProjectFileId = new Map();
  for (const entry of entries) {
    byKey.set(syncEntryKey(entry), entry);
    if (entry.project_file_id != null) byProjectFileId.set(String(entry.project_file_id), entry);
  }
  return { byKey, byProjectFileId };
};

const rememberEntry = (indexes, entry, previous = null) => {
  if (previous) {
    indexes.byKey.delete(syncEntryKey(previous));
    if (previous.project_file_id != null) indexes.byProjectFileId.delete(String(previous.project_file_id));
  }
  indexes.byKey.set(syncEntryKey(entry), entry);
  if (entry.project_file_id != null) indexes.byProjectFileId.set(String(entry.project_file_id), entry);
};

const removeEntryFromIndexes = (indexes, entry) => {
  indexes.byKey.delete(syncEntryKey(entry));
  if (entry.project_file_id != null) indexes.byProjectFileId.delete(String(entry.project_file_id));
};

const localTargetForEntry = (projectDirectory, entry) => path.join(
  categoryDirectory(projectDirectory, entry.category),
  ...normalizeRelativePath(entry.relative_path).split('/'),
);

const canonicalRemoteCategory = remoteFile => JARVIS_TO_DRIVE_CATEGORY[remoteFile.category] || 'inne';

const downloadRemoteFile = async ({
  remote,
  remoteFile,
  existingEntry,
  projectDirectory,
  indexes,
  summary,
}) => {
  const category = existingEntry?.category || canonicalRemoteCategory(remoteFile);
  const baseDirectory = categoryDirectory(projectDirectory, category);
  let relativePath = existingEntry?.relative_path
    || normalizeRelativePath(sanitizeWindowsFolderName(remoteFile.file_name, 'plik'));
  let target = path.join(baseDirectory, ...relativePath.split('/'));
  const remoteStorageChanged = existingEntry && existingEntry.storage_path !== remoteFile.file_path;

  if (existingEntry && !remoteStorageChanged) {
    try {
      const localHash = await sha256File(target);
      if (!shouldTransferByHash(localHash, existingEntry.content_sha256)) {
        summary.skipped += 1;
        return;
      }
      // The local copy changed after the previous sync. Upload it in the local pass.
      summary.localChangesDetected += 1;
      return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const contents = await remote.download(remoteFile.file_path);
  const remoteHash = await sha256Bytes(contents);

  try {
    const localHash = await sha256File(target);
    if (!existingEntry && localHash !== remoteHash) {
      target = await uniqueSiblingPath(target, 'Jarvis');
      relativePath = normalizeRelativePath(path.relative(baseDirectory, target));
      summary.conflictsPreserved += 1;
    } else if (existingEntry && remoteStorageChanged && localHash !== existingEntry.content_sha256) {
      const localConflict = await uniqueSiblingPath(target, 'Lokalny konflikt');
      await writeFileAtomic(localConflict, await readFile(target));
      summary.conflictsPreserved += 1;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await writeFileAtomic(target, contents);
  const savedEntry = await remote.upsertSyncEntry({
    project_id: remoteFile.client_id,
    project_file_id: remoteFile.id,
    category,
    relative_path: relativePath,
    file_name: path.basename(relativePath),
    content_sha256: remoteHash,
    size_bytes: contents.byteLength,
    storage_path: remoteFile.file_path,
    last_synced_at: new Date().toISOString(),
  });
  rememberEntry(indexes, savedEntry, existingEntry);
  summary.downloaded += 1;
};

const sha256Bytes = async contents => createHash('sha256').update(contents).digest('hex');

const uploadLocalFile = async ({
  remote,
  project,
  localFile,
  existingEntry,
  remoteFilesById,
  indexes,
  summary,
  now,
  logger,
}) => {
  const sha256 = await sha256File(localFile.absolutePath);
  if (existingEntry && !shouldTransferByHash(sha256, existingEntry.content_sha256)) {
    summary.skipped += 1;
    return;
  }

  const contents = await readFile(localFile.absolutePath);
  const storagePath = storagePathFor({
    projectId: project.id,
    category: localFile.category,
    relativePath: localFile.relativePath,
    sha256,
    now,
  });
  const fileName = path.basename(localFile.relativePath);
  const fileType = mimeTypeFor(fileName);
  const fileUrl = await remote.upload(storagePath, contents, fileType);
  const currentRemoteFile = existingEntry?.project_file_id == null
    ? null
    : remoteFilesById.get(String(existingEntry.project_file_id));

  let savedFile;
  try {
    const payload = {
      client_id: project.id,
      category: DRIVE_TO_JARVIS_CATEGORY[localFile.category],
      file_name: fileName,
      file_path: storagePath,
      file_url: fileUrl,
      file_type: fileType,
      uploaded_at: now.toISOString(),
    };
    savedFile = currentRemoteFile
      ? await remote.updateProjectFile(currentRemoteFile.id, payload)
      : await remote.createProjectFile({
        ...payload,
        comment: '',
        uploaded_by: null,
        uploaded_by_color: '#718096',
      });
  } catch (error) {
    await remote.removeStorage(storagePath).catch(cleanupError => logger.error(cleanupError));
    throw error;
  }

  const savedEntry = await remote.upsertSyncEntry({
    project_id: project.id,
    project_file_id: savedFile.id,
    category: localFile.category,
    relative_path: localFile.relativePath,
    file_name: fileName,
    content_sha256: sha256,
    size_bytes: await fileSize(localFile.absolutePath),
    storage_path: storagePath,
    last_synced_at: now.toISOString(),
  });
  rememberEntry(indexes, savedEntry, existingEntry);
  remoteFilesById.set(String(savedFile.id), savedFile);

  if (currentRemoteFile?.file_path && currentRemoteFile.file_path !== storagePath) {
    await remote.removeStorage(currentRemoteFile.file_path).catch(cleanupError => logger.error(cleanupError));
  }
  summary.uploaded += 1;
};

export const syncDriveOnce = async ({ remote, root, logger = console, now = new Date() }) => {
  const [projects, remoteFiles, initialEntries] = await Promise.all([
    remote.listProjects(),
    remote.listProjectFiles(),
    remote.listSyncEntries(),
  ]);
  const summary = {
    projects: projects.length,
    files: 0,
    uploaded: 0,
    downloaded: 0,
    movedToDeleted: 0,
    conflictsPreserved: 0,
    localChangesDetected: 0,
    renamedCategoryFolders: 0,
    skipped: 0,
    completedAt: null,
  };
  const knownDirectories = await discoverProjectDirectories(root);
  const projectDirectories = new Map();
  const projectsById = new Map(projects.map(project => [String(project.id), project]));

  for (const project of projects) {
    const directory = await ensureProjectDirectory({
      root,
      project,
      knownDirectories,
      now,
      onCategoryFolderMigrated: count => {
        summary.renamedCategoryFolders += count;
      },
    });
    projectDirectories.set(String(project.id), directory);
  }

  const indexes = indexEntries(initialEntries);
  const remoteFilesById = new Map(remoteFiles.map(file => [String(file.id), file]));
  const remoteFileIds = new Set(remoteFilesById.keys());

  // A missing project_file row means a browser user deleted the file. Preserve
  // the local copy under _Usunięte before forgetting its sync metadata.
  for (const entry of initialEntries) {
    if (entry.project_file_id != null && remoteFileIds.has(String(entry.project_file_id))) continue;
    const projectDirectory = projectDirectories.get(String(entry.project_id));
    if (projectDirectory) {
      const filePath = localTargetForEntry(projectDirectory, entry);
      const deletedRelativePath = `${DRIVE_CATEGORY_FOLDERS.find(item => item.category === entry.category)?.folder}/${entry.relative_path}`;
      const moved = await moveFileToDeleted({
        filePath,
        projectDirectory,
        relativePath: deletedRelativePath,
        now,
      });
      if (moved) summary.movedToDeleted += 1;
    }
    await remote.deleteSyncEntry(entry.id);
    removeEntryFromIndexes(indexes, entry);
  }

  // Pull browser-originated changes first. Local edits are detected against the
  // last synced hash and intentionally left for the upload pass.
  for (const remoteFile of remoteFiles) {
    const projectDirectory = projectDirectories.get(String(remoteFile.client_id));
    if (!projectDirectory) continue;
    await downloadRemoteFile({
      remote,
      remoteFile,
      existingEntry: indexes.byProjectFileId.get(String(remoteFile.id)),
      projectDirectory,
      indexes,
      summary,
    });
  }

  for (const [projectId, projectDirectory] of projectDirectories) {
    const project = projectsById.get(projectId);
    const localFiles = await listProjectWorkingFiles(projectDirectory);
    summary.files += localFiles.length;
    for (const localFile of localFiles) {
      await uploadLocalFile({
        remote,
        project,
        localFile,
        existingEntry: indexes.byKey.get(syncEntryKey({ projectId, ...localFile })),
        remoteFilesById,
        indexes,
        summary,
        now,
        logger,
      });
    }
  }

  summary.completedAt = new Date().toISOString();
  return summary;
};
