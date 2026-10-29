import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_FILE_COLUMNS, createProjectFilesRepository } from './projectFilesRepository';

vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../utils/projectFileAccess', () => ({
  withProjectFileSignedUrls: vi.fn(async files => files),
}));

const fixedNow = () => new Date('2026-10-09T10:11:12.345Z');

const createBucket = () => ({
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn(path => ({ data: { publicUrl: `https://files/${path}` } })),
  remove: vi.fn(async () => ({ error: null })),
  download: vi.fn(),
  list: vi.fn(async () => ({ data: [], error: null })),
});

// Колонки таблицы берутся из декларативной схемы (supabase/schemas) — источника правды для БД.
const schemaColumns = (table) => {
  const sql = readFileSync(resolve(cwd(),`supabase/schemas/public/tables/${table}.sql`), 'utf8');
  const body = sql.match(/CREATE TABLE[^(]*\(([\s\S]*?)\r?\n\);/)[1];
  return new Set([...body.matchAll(/^\s*"([a-z_]+)"\s+/gm)].map(match => match[1]));
};

// Query-builder, который записывает все вызовы и отвечает заданным результатом.
const createQuery = (result) => {
  const calls = [];
  const query = new Proxy({}, {
    get(_, method) {
      if (method === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return (...args) => {
        calls.push([method, ...args]);
        return query;
      };
    },
  });
  return { query, calls };
};

const createListClient = ({ rows, syncResult, bucket = createBucket() }) => {
  const tables = {
    project_files: createQuery({ data: rows, error: null }),
    drive_file_sync_entries: createQuery(syncResult),
  };
  return {
    tables,
    client: { storage: { from: vi.fn(() => bucket) }, from: vi.fn(table => tables[table].query) },
  };
};

describe('projectFilesRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('lists the storage paths of a project before it is purged', async () => {
    const eq = vi.fn(async () => ({ data: [{ file_path: '7/a.jpg' }, { file_path: '' }, { file_path: '7/sto/b.sto' }], error: null }));
    const select = vi.fn(() => ({ eq }));
    const client = { storage: { from: vi.fn() }, from: vi.fn(() => ({ select })) };

    await expect(createProjectFilesRepository({ client }).listStoragePaths(7)).resolves.toEqual(['7/a.jpg', '7/sto/b.sto']);
    expect(select).toHaveBeenCalledWith('file_path');
    expect(eq).toHaveBeenCalledWith('client_id', 7);
  });

  it('removes storage objects in batches and reports the first error', async () => {
    const bucket = createBucket();
    const storageError = new Error('storage down');
    bucket.remove
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: storageError });
    const client = { storage: { from: vi.fn(() => bucket) }, from: vi.fn() };
    const paths = Array.from({ length: 101 }, (_, index) => `7/${index}.jpg`);

    await expect(createProjectFilesRepository({ client }).removeStoragePaths([...paths, '7/0.jpg']))
      .resolves.toBe(storageError);
    expect(bucket.remove).toHaveBeenCalledTimes(2);
    expect(bucket.remove.mock.calls[0][0]).toHaveLength(100);
    expect(bucket.remove.mock.calls[1][0]).toEqual(['7/100.jpg']);
  });

  it('removes a newly uploaded object when inserting its row fails', async () => {
    const bucket = createBucket();
    const databaseError = new Error('insert failed');
    const single = vi.fn(async () => ({ data: null, error: databaseError }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ insert })),
    };
    const repository = createProjectFilesRepository({ client, now: fixedNow });
    const file = { name: 'plan klienta.jpg', type: 'image/jpeg' };

    await expect(repository.upload({
      clientId: 'client-1',
      category: 'projekt',
      file,
      profile: { id: 'user-1', color: '#123456' },
    })).rejects.toBe(databaseError);

    const expectedPath = 'client-1/1791540672345_plan_klienta.jpg';
    expect(bucket.upload).toHaveBeenCalledWith(expectedPath, file, { upsert: false });
    expect(bucket.remove).toHaveBeenCalledWith([expectedPath]);
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      client_id: 'client-1',
      category: 'projekt',
      file_path: expectedPath,
      uploaded_by: 'user-1',
    })]);
    expect(select).toHaveBeenCalledWith(PROJECT_FILE_COLUMNS);
  });

  it('does not touch Storage when deleting the database row is rejected', async () => {
    const bucket = createBucket();
    const databaseError = new Error('delete denied');
    const eq = vi.fn(async () => ({ error: databaseError }));
    const removeRow = vi.fn(() => ({ eq }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ delete: removeRow })),
    };
    const repository = createProjectFilesRepository({ client });

    await expect(repository.remove({
      clientId: 'client-1',
      file: { id: 'file-1', file_path: 'client-1/file.jpg' },
      clearCover: false,
    })).rejects.toBe(databaseError);

    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('keeps the stored object after the row commits even if URL signing throws', async () => {
    const bucket = createBucket();
    const savedFile = {
      id: 'file-1',
      file_path: 'client-1/1791540672345_photo.jpg',
      file_url: 'https://files/client-1/1791540672345_photo.jpg',
    };
    const single = vi.fn(async () => ({ data: savedFile, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ insert })),
    };
    const signFiles = vi.fn(async () => { throw new Error('signing failed'); });
    const repository = createProjectFilesRepository({ client, signFiles, now: fixedNow });

    const result = await repository.upload({
      clientId: 'client-1',
      category: 'inne',
      file: { name: 'photo.jpg', type: 'image/jpeg' },
      profile: null,
    });

    expect(result).toEqual({ ...savedFile, signed_url: savedFile.file_url });
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  describe('database schema contract', () => {
    const projectFileColumns = schemaColumns('project_files');

    it('selects only columns that exist in public.project_files', () => {
      const selected = PROJECT_FILE_COLUMNS.split(',');
      expect(selected.filter(column => !projectFileColumns.has(column))).toEqual([]);
      expect(projectFileColumns.has('client_id')).toBe(true);
    });

    it('inserts and updates project_files rows with existing columns only', async () => {
      const bucket = createBucket();
      const writes = [];
      const single = vi.fn(async () => ({ data: { id: 1, file_path: 'x', file_url: 'x' }, error: null }));
      const select = vi.fn(() => ({ single }));
      const client = {
        storage: { from: vi.fn(() => bucket) },
        from: vi.fn(() => ({
          insert: vi.fn((rows) => { writes.push(...rows); return { select }; }),
          update: vi.fn((row) => { writes.push(row); return { eq: () => ({ select }) }; }),
        })),
      };
      const repository = createProjectFilesRepository({ client, now: fixedNow });
      const file = { name: 'plan.pdf', type: 'application/pdf', size: 2048 };
      const profile = { id: 'user-1', color: '#123456' };

      await repository.upload({ clientId: 7, category: 'projekt', file, profile });
      await repository.replaceSto({ clientId: 7, file, profile, currentFile: null });
      await repository.replaceSto({ clientId: 7, file, profile, currentFile: { id: 1, file_path: '7/sto/old.sto' } });

      expect(writes).toHaveLength(3);
      writes.forEach((row) => {
        expect(Object.keys(row).filter(column => !projectFileColumns.has(column))).toEqual([]);
      });
      expect(select).toHaveBeenCalledWith(PROJECT_FILE_COLUMNS);
    });

    it('reads sizes from drive_file_sync_entries using existing columns only', async () => {
      const syncColumns = schemaColumns('drive_file_sync_entries');
      const { client, tables } = createListClient({ rows: [{ id: 1, file_path: '7/a.pdf' }], syncResult: { data: [], error: null } });

      await createProjectFilesRepository({ client }).list(7);

      const [, columns] = tables.drive_file_sync_entries.calls.find(([method]) => method === 'select');
      expect(columns.split(',').filter(column => !syncColumns.has(column))).toEqual([]);
    });
  });

  describe('file size metadata', () => {
    const rows = [
      { id: 1, file_path: '7/1_synced.pdf', file_name: 'synced.pdf' },
      { id: 2, file_path: '7/2_uploaded.jpg', file_name: 'uploaded.jpg' },
      { id: 3, file_path: '7/sto/3_unknown.sto', file_name: 'unknown.sto' },
    ];

    it('fills sizes from drive sync entries, then Storage metadata', async () => {
      const bucket = createBucket();
      bucket.list.mockImplementation(async folder => ({
        data: folder === '7' ? [{ name: '2_uploaded.jpg', metadata: { size: 512 } }] : [],
        error: null,
      }));
      const { client } = createListClient({
        rows,
        syncResult: { data: [{ project_file_id: 1, size_bytes: 1024 }], error: null },
        bucket,
      });

      const files = await createProjectFilesRepository({ client }).list(7);

      expect(files.map(file => file.size_bytes)).toEqual([1024, 512, undefined]);
      expect(bucket.list).toHaveBeenCalledWith('7', { limit: 1000 });
      expect(bucket.list).toHaveBeenCalledWith('7/sto', { limit: 1000 });
    });

    it('still lists files when every size lookup fails', async () => {
      const bucket = createBucket();
      bucket.list.mockRejectedValue(new Error('storage down'));
      const { client } = createListClient({
        rows,
        syncResult: { data: null, error: new Error('permission denied for drive_file_sync_entries') },
        bucket,
      });

      await expect(createProjectFilesRepository({ client }).list(7)).resolves.toEqual(rows);
    });

    it('returns the local File.size for a fresh upload without persisting it', async () => {
      const bucket = createBucket();
      const savedFile = { id: 9, file_path: 'p', file_url: 'u' };
      const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: savedFile, error: null }) }) }));
      const client = { storage: { from: vi.fn(() => bucket) }, from: vi.fn(() => ({ insert })) };

      const result = await createProjectFilesRepository({ client, now: fixedNow }).upload({
        clientId: 7,
        category: 'inne',
        file: { name: 'a.jpg', type: 'image/jpeg', size: 4096 },
        profile: null,
      });

      expect(result).toMatchObject({ id: 9, size_bytes: 4096 });
      expect(insert.mock.calls[0][0][0]).not.toHaveProperty('size_bytes');
    });
  });
});
