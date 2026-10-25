// @vitest-environment node
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncDriveOnce } from './syncEngine.js';

const temporaryDirectories = [];

const createRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jarvis-drive-engine-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const createRemote = () => {
  const state = {
    projects: [{
      id: 71,
      full_name: 'Anna Kowalska',
      client_name: 'Anna Kowalska',
      project_name: 'Kuchnia',
      lifecycle_status: 'active',
      updated_at: '2026-10-25T10:00:00.000Z',
    }],
    files: [{
      id: 81,
      client_id: 71,
      category: 'usterki',
      file_name: 'drawing.pdf',
      file_path: '71/drawing.pdf',
      file_url: 'https://example.test/drawing.pdf',
      file_type: 'application/pdf',
      uploaded_at: '2026-10-25T10:00:00.000Z',
    }],
    entries: [],
    storage: new Map([['71/drawing.pdf', new TextEncoder().encode('server-v1')]]),
  };

  const remote = {
    listProjects: vi.fn(async () => state.projects.map(item => ({ ...item }))),
    listProjectFiles: vi.fn(async () => state.files.map(item => ({ ...item }))),
    listSyncEntries: vi.fn(async () => state.entries.map(item => ({ ...item }))),
    download: vi.fn(async storagePath => state.storage.get(storagePath)),
    upload: vi.fn(async (storagePath, contents) => {
      state.storage.set(storagePath, contents);
      return `https://example.test/${storagePath}`;
    }),
    removeStorage: vi.fn(async storagePath => state.storage.delete(storagePath)),
    createProjectFile: vi.fn(async (payload) => {
      const saved = { ...payload, id: 82 };
      state.files.push(saved);
      return saved;
    }),
    updateProjectFile: vi.fn(async (id, payload) => {
      const index = state.files.findIndex(file => file.id === id);
      state.files[index] = { ...state.files[index], ...payload };
      return { ...state.files[index] };
    }),
    upsertSyncEntry: vi.fn(async (payload) => {
      const index = state.entries.findIndex(entry => (
        entry.project_id === payload.project_id
        && entry.category === payload.category
        && entry.relative_path === payload.relative_path
      ));
      const saved = { ...payload, id: index >= 0 ? state.entries[index].id : 'entry-1' };
      if (index >= 0) state.entries[index] = saved;
      else state.entries.push(saved);
      return { ...saved };
    }),
    deleteSyncEntry: vi.fn(async (id) => {
      state.entries = state.entries.filter(entry => entry.id !== id);
    }),
  };
  return { remote, state };
};

describe('drive sync engine', () => {
  it('downloads once, deduplicates by hash, uploads local edits, and preserves remote deletions', async () => {
    const root = await createRoot();
    const { remote, state } = createRemote();
    const now = new Date('2026-10-25T12:00:00.000Z');
    const projectDirectory = path.join(root, 'Anna Kowalska', 'Kuchnia');
    const localFile = path.join(projectDirectory, '02_Projekt', 'drawing.pdf');

    const bootstrap = await syncDriveOnce({ remote, root, now });
    expect(bootstrap.downloaded).toBe(1);
    expect(await readFile(localFile, 'utf8')).toBe('server-v1');
    expect(state.entries[0]).toMatchObject({
      project_id: 71,
      project_file_id: 81,
      category: 'projekt',
      relative_path: 'drawing.pdf',
    });

    await rename(
      path.join(projectDirectory, '02_Projekt'),
      path.join(projectDirectory, '02_Rozrys'),
    );
    const unchanged = await syncDriveOnce({ remote, root, now });
    expect(unchanged.renamedCategoryFolders).toBe(1);
    expect(unchanged.downloaded).toBe(0);
    expect(unchanged.uploaded).toBe(0);
    expect(unchanged.movedToDeleted).toBe(0);
    expect(await readFile(localFile, 'utf8')).toBe('server-v1');
    expect(remote.download).toHaveBeenCalledTimes(1);

    await writeFile(localFile, 'local-v2');
    const changed = await syncDriveOnce({ remote, root, now: new Date('2026-10-25T12:05:00.000Z') });
    expect(changed.uploaded).toBe(1);
    expect(remote.updateProjectFile).toHaveBeenCalledWith(81, expect.objectContaining({
      category: 'usterki',
      file_name: 'drawing.pdf',
    }));
    expect(state.entries[0].content_sha256).not.toBe('');

    state.files = [];
    const deleted = await syncDriveOnce({ remote, root, now: new Date('2026-10-25T12:10:00.000Z') });
    expect(deleted.movedToDeleted).toBe(1);
    expect(await readFile(
      path.join(root, 'Anna Kowalska', 'Kuchnia', '_Usunięte', '02_Projekt', 'drawing.pdf'),
      'utf8',
    )).toBe('local-v2');
    expect(state.entries).toHaveLength(0);
  });
});
