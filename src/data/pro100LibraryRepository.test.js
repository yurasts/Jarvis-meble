import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPro100LibraryRepository } from './pro100LibraryRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

const createBucket = () => ({
  upload: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
  download: vi.fn(),
});

describe('pro100LibraryRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('cleans up a new Storage object when creating the database row fails', async () => {
    const bucket = createBucket();
    const databaseError = new Error('insert failed');
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: null, error: databaseError }) }),
    }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ insert })),
    };
    const repository = createPro100LibraryRepository({
      client,
      createStoragePath: () => 'new/project.sto',
    });
    const file = { name: 'project.sto', size: 10, type: '' };

    await expect(repository.create({ file, metadata: { title: 'Project' } }))
      .rejects.toMatchObject({ stage: 'create-save' });

    expect(bucket.upload).toHaveBeenCalledWith('new/project.sto', file, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    expect(bucket.remove).toHaveBeenCalledWith(['new/project.sto']);
  });

  it('commits a replacement before removing the previous Storage object', async () => {
    const bucket = createBucket();
    const savedFile = { id: 'file-1', storage_path: 'new/project.sto', version: 3 };
    const single = vi.fn(async () => ({ data: savedFile, error: null }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ update })),
    };
    const repository = createPro100LibraryRepository({
      client,
      createStoragePath: () => 'new/project.sto',
    });
    const currentFile = { id: 'file-1', storage_path: 'old/project.sto', version: 2 };
    const nextFile = { name: 'project-v3.sto', size: 20, type: 'application/octet-stream' };

    await expect(repository.replace(currentFile, nextFile)).resolves.toEqual(savedFile);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: 'new/project.sto',
      version: 3,
    }));
    expect(bucket.remove).toHaveBeenCalledWith(['old/project.sto']);
  });

  it('does not remove Storage when deleting the database row fails', async () => {
    const bucket = createBucket();
    const eq = vi.fn(async () => ({ error: new Error('denied') }));
    const client = {
      storage: { from: vi.fn(() => bucket) },
      from: vi.fn(() => ({ delete: () => ({ eq }) })),
    };
    const repository = createPro100LibraryRepository({ client });

    await expect(repository.remove({ id: 'file-1', storage_path: 'old/project.sto' }))
      .rejects.toMatchObject({ stage: 'delete' });

    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
