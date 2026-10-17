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
});

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
});
