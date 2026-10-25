// @vitest-environment node
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DRIVE_CATEGORY_FOLDERS, PROJECT_MARKER_FILE } from './constants.js';
import {
  discoverProjectDirectories,
  ensureProjectDirectory,
  moveFileToDeleted,
  readProjectMarker,
} from './fileSystem.js';

const temporaryDirectories = [];

const createTemporaryRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jarvis-drive-sync-'));
  temporaryDirectories.push(root);
  return root;
};

const pathExists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('drive sync project folders', () => {
  it('creates the marker and four working folders, then safely moves the folder after a rename', async () => {
    const root = await createTemporaryRoot();
    const knownDirectories = new Map();
    const initialProject = {
      id: 17,
      client_name: 'Anna Kowalska',
      project_name: 'Kuchnia',
      lifecycle_status: 'active',
    };
    const initialDirectory = await ensureProjectDirectory({
      root,
      project: initialProject,
      knownDirectories,
      now: new Date('2026-10-25T10:00:00.000Z'),
    });

    expect(await pathExists(path.join(initialDirectory, PROJECT_MARKER_FILE))).toBe(true);
    for (const { folder } of DRIVE_CATEGORY_FOLDERS) {
      expect(await pathExists(path.join(initialDirectory, folder))).toBe(true);
    }
    await writeFile(path.join(initialDirectory, '02_Rozrys', 'local.sto'), 'project data');

    const discovered = await discoverProjectDirectories(root);
    const renamedDirectory = await ensureProjectDirectory({
      root,
      project: {
        ...initialProject,
        client_name: 'Anna Nowak',
        project_name: 'Kuchnia finalna',
        lifecycle_status: 'archived',
      },
      knownDirectories: discovered,
      now: new Date('2026-10-25T11:00:00.000Z'),
    });

    expect(renamedDirectory).toBe(path.join(root, '_Archiwum', 'Anna Nowak', 'Kuchnia finalna'));
    expect(await pathExists(initialDirectory)).toBe(false);
    expect(await readFile(path.join(renamedDirectory, '02_Rozrys', 'local.sto'), 'utf8')).toBe('project data');
    await expect(readProjectMarker(renamedDirectory)).resolves.toMatchObject({
      projectId: 17,
      clientName: 'Anna Nowak',
      projectName: 'Kuchnia finalna',
      lifecycleStatus: 'archived',
    });
  });

  it('moves a remotely deleted file into _Usunięte instead of erasing it', async () => {
    const root = await createTemporaryRoot();
    const projectDirectory = await ensureProjectDirectory({
      root,
      project: {
        id: 18,
        client_name: 'Piotr',
        project_name: 'Garderoba',
        lifecycle_status: 'active',
      },
      knownDirectories: new Map(),
    });
    const source = path.join(projectDirectory, '01_Zlecenie', 'umowa.pdf');
    await writeFile(source, 'important');

    const moved = await moveFileToDeleted({
      filePath: source,
      projectDirectory,
      relativePath: '01_Zlecenie/umowa.pdf',
      now: new Date('2026-10-25T12:00:00.000Z'),
    });

    expect(moved).toBe(path.join(projectDirectory, '_Usunięte', '01_Zlecenie', 'umowa.pdf'));
    expect(await pathExists(source)).toBe(false);
    expect(await readFile(moved, 'utf8')).toBe('important');
  });

  it('uses a project id suffix instead of merging two colliding folders', async () => {
    const root = await createTemporaryRoot();
    const knownDirectories = new Map();
    const first = await ensureProjectDirectory({
      root,
      project: { id: 21, client_name: 'CON', project_name: 'Szafa?', lifecycle_status: 'active' },
      knownDirectories,
    });
    const second = await ensureProjectDirectory({
      root,
      project: { id: 22, client_name: 'CON', project_name: 'Szafa*', lifecycle_status: 'active' },
      knownDirectories,
    });

    expect(first).toBe(path.join(root, '_CON', 'Szafa_'));
    expect(second).toBe(path.join(root, '_CON', 'Szafa_ [22]'));
    await expect(readProjectMarker(first)).resolves.toMatchObject({ projectId: 21 });
    await expect(readProjectMarker(second)).resolves.toMatchObject({ projectId: 22 });
  });
});
